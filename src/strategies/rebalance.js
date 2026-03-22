/**
 * Portfolio Rebalancing Strategy
 * 
 * Monitors portfolio allocation drift and triggers rebalancing
 * when any asset deviates beyond threshold from target allocation.
 * 
 * Uses MoonPay CLI for swap execution, OWS for signing.
 */

export class RebalanceStrategy {
  constructor(config = {}) {
    this.name = 'rebalance';
    this.targetAllocations = config.targets || {
      'ETH': 0.40,   // 40% ETH
      'USDC': 0.30,  // 30% stablecoins
      'WBTC': 0.20,  // 20% BTC
      'LINK': 0.10,  // 10% alts
    };
    this.driftThreshold = config.driftThreshold || 0.05; // 5% drift triggers rebalance
    this.minRebalanceUsd = config.minRebalance || 10;    // Don't rebalance < $10
    this.lastRebalance = null;
    this.rebalanceCooldownMs = config.cooldown || 3600_000; // 1 hour minimum between rebalances
  }

  /**
   * Analyze current portfolio and determine needed trades
   */
  analyze(portfolio) {
    const totalValue = Object.values(portfolio).reduce((sum, pos) => sum + pos.valueUsd, 0);
    if (totalValue === 0) return { needsRebalance: false, reason: 'Empty portfolio' };

    const currentAllocations = {};
    const drifts = {};
    const trades = [];

    for (const [asset, target] of Object.entries(this.targetAllocations)) {
      const current = (portfolio[asset]?.valueUsd || 0) / totalValue;
      currentAllocations[asset] = current;
      drifts[asset] = current - target;

      if (Math.abs(drifts[asset]) > this.driftThreshold) {
        const tradeValueUsd = Math.abs(drifts[asset]) * totalValue;
        if (tradeValueUsd >= this.minRebalanceUsd) {
          trades.push({
            asset,
            direction: drifts[asset] > 0 ? 'sell' : 'buy',
            currentAllocation: (current * 100).toFixed(1) + '%',
            targetAllocation: (target * 100).toFixed(1) + '%',
            drift: (drifts[asset] * 100).toFixed(1) + '%',
            tradeValueUsd: tradeValueUsd.toFixed(2),
          });
        }
      }
    }

    // Check cooldown
    if (this.lastRebalance && Date.now() - this.lastRebalance < this.rebalanceCooldownMs) {
      return {
        needsRebalance: false,
        reason: 'Cooldown active',
        nextEligible: new Date(this.lastRebalance + this.rebalanceCooldownMs).toISOString(),
        drifts,
      };
    }

    return {
      needsRebalance: trades.length > 0,
      totalValueUsd: totalValue.toFixed(2),
      currentAllocations,
      targetAllocations: this.targetAllocations,
      drifts,
      trades,
    };
  }

  /**
   * Generate MoonPay CLI swap commands for rebalancing
   */
  generateTrades(analysis, chain = 'base') {
    if (!analysis.needsRebalance) return [];

    // Pair sells with buys to minimize transactions
    const sells = analysis.trades.filter(t => t.direction === 'sell');
    const buys = analysis.trades.filter(t => t.direction === 'buy');

    const swaps = [];

    for (const sell of sells) {
      for (const buy of buys) {
        const tradeAmount = Math.min(
          parseFloat(sell.tradeValueUsd),
          parseFloat(buy.tradeValueUsd)
        );

        if (tradeAmount >= this.minRebalanceUsd) {
          swaps.push({
            fromToken: sell.asset,
            toToken: buy.asset,
            amountUsd: tradeAmount,
            chain,
            reason: `Rebalance: ${sell.asset} ${sell.drift} over target → ${buy.asset} ${buy.drift} under target`,
          });
        }
      }
    }

    return swaps;
  }

  recordRebalance() {
    this.lastRebalance = Date.now();
  }
}
