import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RebalanceStrategy } from '../src/strategies/rebalance.js';
import { SmartDCAStrategy } from '../src/strategies/smart-dca.js';
import { YieldHunterStrategy } from '../src/strategies/yield-hunter.js';

describe('RebalanceStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RebalanceStrategy({
      targets: { ETH: 0.50, USDC: 0.30, WBTC: 0.20 },
      driftThreshold: 0.05,
    });
  });

  it('detects portfolio drift above threshold', () => {
    const portfolio = {
      ETH: { valueUsd: 700 },  // 70% (target 50% → +20% drift)
      USDC: { valueUsd: 200 }, // 20% (target 30% → -10% drift)
      WBTC: { valueUsd: 100 }, // 10% (target 20% → -10% drift)
    };

    const result = strategy.analyze(portfolio);
    assert.strictEqual(result.needsRebalance, true);
    assert.ok(result.trades.length > 0);
    assert.strictEqual(result.trades[0].asset, 'ETH');
    assert.strictEqual(result.trades[0].direction, 'sell');
  });

  it('returns no trades when portfolio is balanced', () => {
    const portfolio = {
      ETH: { valueUsd: 510 },
      USDC: { valueUsd: 290 },
      WBTC: { valueUsd: 200 },
    };

    const result = strategy.analyze(portfolio);
    assert.strictEqual(result.needsRebalance, false);
  });

  it('generates paired swap commands', () => {
    const portfolio = {
      ETH: { valueUsd: 700 },
      USDC: { valueUsd: 200 },
      WBTC: { valueUsd: 100 },
    };

    const analysis = strategy.analyze(portfolio);
    const trades = strategy.generateTrades(analysis);
    
    assert.ok(trades.length > 0);
    assert.ok(trades[0].fromToken);
    assert.ok(trades[0].toToken);
    assert.ok(trades[0].amountUsd > 0);
  });

  it('handles empty portfolio', () => {
    const result = strategy.analyze({});
    assert.strictEqual(result.needsRebalance, false);
  });
});

describe('SmartDCAStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new SmartDCAStrategy({
      baseAmount: 100,
      token: 'ETH',
      chain: 'base',
    });
  });

  it('buys at base amount with no price history', () => {
    const calc = strategy.calculateBuyAmount();
    assert.strictEqual(calc.amount, 100);
    assert.strictEqual(calc.multiplier, 1);
  });

  it('buys more during high volatility', () => {
    // Simulate wild price swings
    const prices = [100, 115, 95, 120, 85, 110, 90, 130, 80, 105, 95, 125, 88, 112, 93];
    prices.forEach((p, i) => strategy.recordPrice(p, Date.now() - (15 - i) * 3600_000));

    const calc = strategy.calculateBuyAmount();
    assert.ok(calc.multiplier > 1.0, `Expected multiplier > 1.0, got ${calc.multiplier}`);
    assert.ok(calc.amount > 100, `Expected amount > 100, got ${calc.amount}`);
  });

  it('buys less when overbought', () => {
    // Simulate steady uptrend (overbought)
    for (let i = 0; i < 20; i++) {
      strategy.recordPrice(100 + i * 3, Date.now() - (20 - i) * 3600_000);
    }

    const calc = strategy.calculateBuyAmount();
    assert.ok(calc.multiplier < 1.0, `Expected multiplier < 1.0, got ${calc.multiplier}`);
    assert.strictEqual(calc.signal, 'OVERBOUGHT_BUY_LESS');
  });

  it('buys more when oversold', () => {
    // Simulate steady downtrend (oversold)
    for (let i = 0; i < 20; i++) {
      strategy.recordPrice(200 - i * 5, Date.now() - (20 - i) * 3600_000);
    }

    const calc = strategy.calculateBuyAmount();
    assert.ok(calc.multiplier > 1.0, `Expected multiplier > 1.0, got ${calc.multiplier}`);
    assert.strictEqual(calc.signal, 'OVERSOLD_BUY_MORE');
  });

  it('generates MoonPay CLI commands', () => {
    const execution = strategy.execute();
    assert.ok(execution.cliCommand.includes('mp swap'));
    assert.ok(execution.cliCommand.includes('--from USDC'));
    assert.ok(execution.cliCommand.includes('--to ETH'));
  });

  it('tracks performance', () => {
    strategy.execute();
    strategy.execute();
    const perf = strategy.getPerformance();
    assert.strictEqual(perf.buys, 2);
    assert.strictEqual(perf.totalInvested, 200);
  });
});

describe('YieldHunterStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new YieldHunterStrategy({
      minYield: 0.03,
      maxExposure: 0.40,
      computeCost: 2.50,
    });
  });

  it('ranks opportunities by risk-adjusted APY', () => {
    const analysis = strategy.analyzeOpportunities();
    assert.ok(analysis.opportunities.length > 0);
    
    // Should be sorted by risk-adjusted APY descending
    for (let i = 1; i < analysis.opportunities.length; i++) {
      assert.ok(
        analysis.opportunities[i - 1].riskAdjustedApy >= analysis.opportunities[i].riskAdjustedApy,
        'Not sorted by risk-adjusted APY'
      );
    }
  });

  it('respects max protocol exposure', () => {
    const allocation = strategy.optimizeAllocation(1000);
    for (const alloc of allocation.allocations) {
      assert.ok(alloc.allocationUsd <= 400, `Allocation $${alloc.allocationUsd} exceeds 40% of $1000`);
    }
  });

  it('calculates self-sustainability', () => {
    const allocation = strategy.optimizeAllocation(50000);
    assert.ok(typeof allocation.selfSustaining === 'boolean');
    assert.ok(allocation.selfSustainingMessage.includes('$'));
  });

  it('reports self-sustaining at sufficient capital', () => {
    // $50K at ~5% = ~$6.85/day, > $2.50 compute cost
    const allocation = strategy.optimizeAllocation(50000);
    assert.strictEqual(allocation.selfSustaining, true);
  });

  it('reports not self-sustaining at low capital', () => {
    // $100 at ~5% = ~$0.01/day, < $2.50 compute cost
    const allocation = strategy.optimizeAllocation(100);
    assert.strictEqual(allocation.selfSustaining, false);
  });

  it('generates deployment plan with bridge steps', () => {
    const allocation = strategy.optimizeAllocation(1000);
    const plan = strategy.generateDeploymentPlan('ethereum', allocation);
    assert.ok(plan.steps.length > 0);
    assert.ok(plan.totalSteps > 0);
  });

  it('filters out low-yield opportunities', () => {
    const lowYieldStrategy = new YieldHunterStrategy({ minYield: 0.10 });
    const analysis = lowYieldStrategy.analyzeOpportunities();
    for (const opp of analysis.opportunities) {
      assert.ok(opp.apy >= 0.10);
    }
  });
});
