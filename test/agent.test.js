import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AegisAgent } from '../src/agent.js';

describe('AegisAgent', () => {
  let agent;

  beforeEach(async () => {
    agent = new AegisAgent({
      policies: {
        spendingLimits: { daily: { usd: 200 }, weekly: { usd: 1000 }, monthly: { usd: 3000 } },
        maxSlippage: 0.02,
      },
      rebalance: {
        targets: { ETH: 0.50, USDC: 0.30, WBTC: 0.20 },
        driftThreshold: 0.05,
      },
      dca: { baseAmount: 50, token: 'ETH', chain: 'base' },
      yield: { minYield: 0.03, computeCost: 2.50 },
    });
  });

  it('initializes all components', async () => {
    const result = await agent.initialize();
    assert.strictEqual(result.success, true);
    assert.ok(result.strategies.includes('rebalance'));
    assert.ok(result.strategies.includes('smartDCA'));
    assert.ok(result.strategies.includes('yieldHunter'));
  });

  it('enforces policies on actions', async () => {
    await agent.initialize();

    // Should deny swap on unapproved chain
    const result = await agent.executeAction({
      type: 'swap',
      chain: 'eip155:666',
      amountUsd: 50,
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: 50,
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.denied, true);
  });

  it('executes approved swaps', async () => {
    await agent.initialize();

    const result = await agent.executeAction({
      type: 'swap',
      chain: 'eip155:8453', // Base - approved
      amountUsd: 50,
      fromToken: 'ETH',
      toToken: 'USDC',
      amount: 50,
      protocol: 'moonpay',
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.execution);
    assert.ok(result.execution.cliCommand.includes('mp swap'));
  });

  it('runs a full agent cycle', async () => {
    await agent.initialize();

    const portfolio = {
      ETH: { valueUsd: 700 },
      USDC: { valueUsd: 200 },
      WBTC: { valueUsd: 100 },
    };

    const cycle = await agent.runCycle(portfolio);
    assert.ok(cycle.timestamp);
    assert.ok(Array.isArray(cycle.actions));
    assert.ok(Array.isArray(cycle.decisions));
  });

  it('tracks actions executed and denied', async () => {
    await agent.initialize();

    await agent.executeAction({ type: 'swap', chain: 'eip155:8453', amountUsd: 20, fromToken: 'ETH', toToken: 'USDC', amount: 20, protocol: 'moonpay' });
    await agent.executeAction({ type: 'swap', chain: 'eip155:666', amountUsd: 20, fromToken: 'ETH', toToken: 'USDC', amount: 20 });

    const status = agent.getStatus();
    assert.strictEqual(status.state.actionsExecuted, 1);
    assert.strictEqual(status.state.actionsDenied, 1);
  });

  it('provides full status dashboard data', async () => {
    await agent.initialize();

    const status = agent.getStatus();
    assert.strictEqual(status.agent, 'aegis');
    assert.ok(status.wallet);
    assert.ok(status.spending);
    assert.ok(status.strategies);
    assert.ok(status.strategies.rebalance);
    assert.ok(status.strategies.smartDCA);
    assert.ok(status.strategies.yieldHunter);
  });

  it('logs all decisions for transparency', async () => {
    await agent.initialize();
    await agent.executeAction({ type: 'swap', chain: 'eip155:8453', amountUsd: 20, fromToken: 'ETH', toToken: 'USDC', amount: 20, protocol: 'moonpay' });

    const status = agent.getStatus();
    assert.ok(status.decisionLog.length >= 2); // init + action
  });

  it('respects daily spending limits across multiple actions', async () => {
    await agent.initialize();

    // Execute several swaps
    for (let i = 0; i < 3; i++) {
      await agent.executeAction({ type: 'swap', chain: 'eip155:8453', amountUsd: 60, fromToken: 'ETH', toToken: 'USDC', amount: 60, protocol: 'moonpay' });
    }

    // 4th should be denied (60*4=240 > 200 daily limit)
    const result = await agent.executeAction({ type: 'swap', chain: 'eip155:8453', amountUsd: 60, fromToken: 'ETH', toToken: 'USDC', amount: 60, protocol: 'moonpay' });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.denied, true);
  });
});
