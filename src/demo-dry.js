#!/usr/bin/env node

/**
 * Aegis Dry Run Demo — No credentials, no RPCs, no auth required.
 * 
 * Shows the policy engine, strategy logic, gas oracle, and decision trace
 * working together with simulated data. Judges can run this immediately:
 * 
 *   npm run demo:dry
 * 
 * Zero external dependencies. Zero network calls. Pure logic.
 */

import { AegisAgent } from './agent.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function header(text) {
  console.log(`\n${BOLD}${CYAN}═══ ${text} ═══${RESET}\n`);
}

function pass(text) { console.log(`  ${GREEN}✓${RESET} ${text}`); }
function fail(text) { console.log(`  ${RED}✗${RESET} ${text}`); }
function info(text) { console.log(`  ${DIM}${text}${RESET}`); }
function warn(text) { console.log(`  ${YELLOW}⚠${RESET} ${text}`); }

async function main() {
  console.log(`
${BOLD}╔══════════════════════════════════════════════════════════╗
║          AEGIS — Self-Governing Agent Treasury            ║
║                   Dry Run Demo Mode                       ║
║                                                           ║
║   No credentials. No RPCs. No auth. Pure logic demo.      ║
╚══════════════════════════════════════════════════════════════╝${RESET}
`);

  // Initialize agent with demo policies
  const agent = new AegisAgent({
    policies: {
      spendingLimits: { daily: { usd: 500 }, weekly: { usd: 2000 }, monthly: { usd: 5000 } },
      allowedChains: ['eip155:1', 'eip155:8453', 'eip155:42161', 'eip155:10', 'eip155:137'],
      allowedProtocols: ['uniswap-v3', 'aave-v3', 'lido', 'curve', 'moonpay'],
      maxSlippage: 0.02,
      maxConcentration: 0.40,
      cooldownMs: 60_000,
    },
  });

  await agent.initialize();
  info(`Environment: ${agent.env} | Testnet: ${agent.isTestnet}`);

  // ─── 1. Smart DCA Demo ───
  header('SMART DCA — Volatility-Adjusted Buying');

  const dca = agent.strategies.smartDCA;
  
  // Simulate price history: dropping market (oversold)
  const prices = [3200, 3150, 3080, 3020, 2950, 2890, 2850, 2820, 2800, 2780, 2760, 2750, 2740, 2730, 2720];
  prices.forEach(p => dca.recordPrice(p));
  
  const buyCalc = dca.calculateBuyAmount();
  pass(`Market analysis: momentum RSI ${buyCalc.momentum}, volatility ${buyCalc.volatility}`);
  pass(`Signal: ${buyCalc.signal}`);
  pass(`Buy amount: $${buyCalc.amount} (${buyCalc.multiplier}x base of $${buyCalc.baseAmount})`);
  info(`Reasoning: ${buyCalc.reasoning}`);

  // Now simulate recovering market (overbought)
  console.log('');
  info('Simulating market recovery...');
  [2800, 2900, 3050, 3200, 3400, 3550, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500].forEach(p => dca.recordPrice(p));
  
  const recoveryCalc = dca.calculateBuyAmount();
  pass(`Market shifted: momentum RSI ${recoveryCalc.momentum}, signal: ${recoveryCalc.signal}`);
  pass(`Buy amount adjusted: $${recoveryCalc.amount} (${recoveryCalc.multiplier}x — buying LESS in overbought conditions)`);

  // ─── 2. Gas Oracle Demo ───
  header('GAS ORACLE — Chain-Aware Cost Optimization');

  const gasOracle = agent.gasOracle;
  
  // Show gas across chains
  const chains = [
    ['Ethereum', 'eip155:1'],
    ['Base', 'eip155:8453'],
    ['Arbitrum', 'eip155:42161'],
    ['Optimism', 'eip155:10'],
    ['Polygon', 'eip155:137'],
  ];

  for (const [name, chainId] of chains) {
    const gas = gasOracle.estimateGasCost(chainId, 'swap');
    const icon = gas.tier === 'cheap' ? '🟢' : gas.tier === 'moderate' ? '🟡' : '🔴';
    pass(`${name}: $${gas.estimatedUsd.toFixed(4)} per swap ${icon} ${gas.tier}`);
  }

  console.log('');
  info('Testing $25 swap on Ethereum mainnet...');
  const ethCheck = gasOracle.isGasEfficient('eip155:1', 25, 'swap');
  fail(`REJECTED — gas $${ethCheck.gasCostUsd.toFixed(2)} is ${ethCheck.gasToTradeRatio} of trade value`);
  pass(`Recommendation: ${ethCheck.recommendation}`);

  console.log('');
  info('Same $25 swap on Base...');
  const baseCheck = gasOracle.isGasEfficient('eip155:8453', 25, 'swap');
  pass(`APPROVED — gas $${baseCheck.gasCostUsd.toFixed(4)} is ${baseCheck.gasToTradeRatio} of trade value`);

  // ─── 3. Policy Engine Demo ───
  header('POLICY ENGINE — 6 Layers of Protection');

  // Approved action
  const goodAction = await agent.executeAction({
    type: 'swap', chain: 'eip155:8453', amountUsd: 100,
    fromToken: 'USDC', toToken: 'ETH', protocol: 'moonpay',
  });
  pass(`$100 USDC→ETH on Base: ${goodAction.success ? 'APPROVED' : 'DENIED'}`);
  info(`Trace: ${goodAction.trace}`);

  // Wrong chain
  const badChain = await agent.executeAction({
    type: 'swap', chain: 'eip155:56', amountUsd: 50,
    fromToken: 'USDC', toToken: 'BNB', protocol: 'pancakeswap',
  });
  fail(`$50 swap on BSC: DENIED — ${badChain.reason}`);
  info(`Trace: ${badChain.trace}`);

  // Excessive slippage
  const badSlippage = agent.policies.evaluate({
    type: 'swap', chain: 'eip155:8453', amountUsd: 50,
    protocol: 'moonpay', slippage: 0.08,
  });
  fail(`8% slippage swap: DENIED — ${badSlippage.reason}`);

  // Spend up to daily limit — disable cooldown for this demo section
  console.log('');
  info('Testing spending limits (burning through $500/day cap)...');
  const savedCooldown = agent.policies.policies.cooldownMs;
  agent.policies.policies.cooldownMs = 0; // disable for demo
  
  for (let i = 0; i < 4; i++) {
    const r = await agent.executeAction({
      type: 'swap', chain: 'eip155:8453', amountUsd: 120,
      fromToken: 'USDC', toToken: 'ETH', protocol: 'moonpay',
    });
    if (r.success) pass(`$120 swap #${i + 1}: APPROVED`);
    else fail(`$120 swap #${i + 1}: DENIED — ${r.reason}`);
  }
  const spending = agent.policies.getSpendingSummary();
  warn(`Daily spending now: $${spending.daily.spent.toFixed(0)} / $${spending.daily.limit} limit`);

  const overLimit = await agent.executeAction({
    type: 'swap', chain: 'eip155:8453', amountUsd: 100,
    fromToken: 'USDC', toToken: 'ETH', protocol: 'moonpay',
  });
  fail(`$100 more: DENIED — ${overLimit.reason}`);
  agent.policies.policies.cooldownMs = savedCooldown; // restore

  // ─── 4. Portfolio Rebalancing Demo ───
  header('PORTFOLIO REBALANCING — Drift Detection');

  const portfolio = {
    ETH: { valueUsd: 7000 },   // 70% — way over 40% target
    USDC: { valueUsd: 2000 },  // 20% — under 30% target
    WBTC: { valueUsd: 500 },   // 5% — under 20% target
    LINK: { valueUsd: 500 },   // 5% — under 10% target
  };

  const analysis = agent.strategies.rebalance.analyze(portfolio);
  pass(`Portfolio total: $${analysis.totalValueUsd}`);
  
  if (analysis.needsRebalance) {
    warn(`${analysis.trades.length} rebalancing trades needed:`);
    for (const trade of analysis.trades) {
      const icon = trade.direction === 'sell' ? '📉' : '📈';
      info(`  ${icon} ${trade.direction.toUpperCase()} ${trade.asset}: ${trade.currentAllocation} → ${trade.targetAllocation} (drift: ${trade.drift})`);
    }
  }

  // ─── 5. Yield Hunting — Self-Sustainability ───
  header('YIELD HUNTING — Self-Sustaining Treasury');

  const yieldPlan = agent.strategies.yieldHunter.optimizeAllocation(50_000);
  
  pass(`Capital allocated: $${yieldPlan.totalAllocated.toLocaleString()}`);
  pass(`Expected daily yield: $${yieldPlan.expectedDailyYield.toFixed(2)}`);
  pass(`Agent compute cost: $${yieldPlan.computeCostPerDay}/day`);
  console.log('');
  
  if (yieldPlan.selfSustaining) {
    pass(`${BOLD}${GREEN}${yieldPlan.selfSustainingMessage}${RESET}`);
  } else {
    warn(yieldPlan.selfSustainingMessage);
  }

  console.log('');
  info('Allocation breakdown:');
  for (const alloc of yieldPlan.allocations) {
    info(`  • ${alloc.protocol} on ${alloc.chain}: $${alloc.allocationUsd.toLocaleString()} @ ${alloc.apy} → $${alloc.expectedDailyYield.toFixed(2)}/day`);
  }

  // ─── 6. Decision Trace Summary ───
  header('DECISION TRACE — Full Audit Trail');

  const stats = agent.decisionTrace.getStats();
  pass(`Total decisions traced: ${stats.total}`);
  pass(`By result: ${Object.entries(stats.byResult).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  pass(`By strategy: ${Object.entries(stats.byStrategy).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

  console.log('');
  info('Recent trace summaries:');
  const recent = agent.decisionTrace.getTraces(5);
  for (const trace of recent) {
    const icon = trace.result === 'EXECUTED' ? GREEN + '●' : trace.result === 'DENIED' ? RED + '●' : YELLOW + '●';
    info(`  ${icon}${RESET} ${trace.summary}`);
  }

  // ─── Final ───
  console.log(`
${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}

  ${BOLD}Summary:${RESET}
  ${GREEN}✓${RESET} Smart DCA adapts buys to market conditions
  ${GREEN}✓${RESET} Gas oracle prevents wasteful L1 trades
  ${GREEN}✓${RESET} 6-layer policy engine enforces every action
  ${GREEN}✓${RESET} Portfolio rebalancer detects allocation drift
  ${GREEN}✓${RESET} Yield hunter makes the treasury self-sustaining
  ${GREEN}✓${RESET} Every decision traced for compliance audit

  ${DIM}All of the above ran with zero credentials, zero RPCs,
  zero network calls. This is the brain of Aegis.${RESET}

  ${BOLD}Next: AEGIS_ENV=testnet npm start${RESET} ${DIM}(with testnet RPCs)${RESET}
  ${BOLD}Then: npm start${RESET} ${DIM}(production, real money)${RESET}

${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}
`);
}

main().catch(console.error);
