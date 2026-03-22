/**
 * Gas Oracle — Chain-aware gas estimation for Aegis
 * 
 * Prevents strategies from executing trades where gas costs
 * eat into returns. L1 vs L2 awareness is critical:
 * - Ethereum mainnet: $5-50 per swap
 * - Base/Arbitrum/Optimism: $0.01-0.10 per swap
 * - Polygon: $0.005-0.05 per swap
 * 
 * The agent should NOT rebalance $50 on Ethereum if gas is $30.
 */

export class GasOracle {
  constructor(config = {}) {
    // Gas price feeds per chain (in gwei or native units)
    // In production: fetch from RPC eth_gasPrice / EIP-1559 baseFee
    this.gasPrices = {
      'eip155:1':     { avgGwei: 25, swapGasUnits: 150_000, nativePrice: 2500 },  // Ethereum
      'eip155:8453':  { avgGwei: 0.005, swapGasUnits: 150_000, nativePrice: 2500 }, // Base
      'eip155:42161': { avgGwei: 0.1, swapGasUnits: 700_000, nativePrice: 2500 },   // Arbitrum (different gas model)
      'eip155:10':    { avgGwei: 0.005, swapGasUnits: 150_000, nativePrice: 2500 }, // Optimism
      'eip155:137':   { avgGwei: 80, swapGasUnits: 150_000, nativePrice: 0.50 },    // Polygon (POL)
    };

    // Max acceptable gas-to-trade ratio
    this.maxGasRatio = config.maxGasRatio || 0.05; // 5% — don't spend >5% of trade value on gas
    this.preferredChains = config.preferredChains || ['eip155:8453', 'eip155:42161', 'eip155:10'];
    this.lastUpdate = Date.now();
  }

  /**
   * Estimate gas cost in USD for a transaction type on a given chain
   */
  estimateGasCost(chain, txType = 'swap') {
    const gasData = this.gasPrices[chain];
    if (!gasData) return { estimatedUsd: 0, chain, tier: 'cheap', warning: 'Unknown chain — gas not estimated' };

    const gasMultipliers = {
      'swap': 1.0,
      'bridge': 1.8,        // bridges use more gas (approval + swap + bridge tx)
      'deposit': 1.2,       // yield deposits
      'approve': 0.3,       // token approval
      'rebalance': 2.0,     // multi-step rebalance
    };

    const multiplier = gasMultipliers[txType] || 1.0;
    const gasUnits = gasData.swapGasUnits * multiplier;
    const gasCostNative = (gasUnits * gasData.avgGwei) / 1e9; // gwei → native token
    const gasCostUsd = gasCostNative * gasData.nativePrice;

    return {
      chain,
      txType,
      gasUnits: Math.round(gasUnits),
      gasPriceGwei: gasData.avgGwei,
      gasCostNative: parseFloat(gasCostNative.toFixed(8)),
      estimatedUsd: parseFloat(gasCostUsd.toFixed(4)),
      tier: gasCostUsd < 0.10 ? 'cheap' : gasCostUsd < 2.0 ? 'moderate' : 'expensive',
    };
  }

  /**
   * Check if a trade is gas-efficient
   * Returns { efficient: bool, gasCostUsd, ratio, recommendation }
   */
  isGasEfficient(chain, tradeValueUsd, txType = 'swap') {
    const gasEstimate = this.estimateGasCost(chain, txType);
    const ratio = tradeValueUsd > 0 ? gasEstimate.estimatedUsd / tradeValueUsd : 1;

    const result = {
      efficient: ratio <= this.maxGasRatio,
      gasCostUsd: gasEstimate.estimatedUsd,
      tradeValueUsd,
      gasToTradeRatio: parseFloat((ratio * 100).toFixed(2)) + '%',
      maxAllowedRatio: (this.maxGasRatio * 100) + '%',
      chain: gasEstimate.chain,
      gasTier: gasEstimate.tier,
    };

    if (!result.efficient) {
      // Suggest cheaper alternative
      const alternatives = this.findCheaperChain(tradeValueUsd, txType);
      result.recommendation = alternatives.length > 0
        ? `Route via ${alternatives[0].chain} instead (gas: $${alternatives[0].estimatedUsd.toFixed(4)} vs $${gasEstimate.estimatedUsd.toFixed(4)})`
        : `Trade too small for any chain at current gas prices. Minimum trade: $${(gasEstimate.estimatedUsd / this.maxGasRatio).toFixed(2)}`;
      result.alternatives = alternatives;
    }

    return result;
  }

  /**
   * Find the cheapest chain for a given trade
   */
  findCheaperChain(tradeValueUsd, txType = 'swap') {
    return Object.keys(this.gasPrices)
      .map(chain => {
        const estimate = this.estimateGasCost(chain, txType);
        const ratio = tradeValueUsd > 0 ? estimate.estimatedUsd / tradeValueUsd : 1;
        return { ...estimate, ratio, efficient: ratio <= this.maxGasRatio };
      })
      .filter(e => e.efficient)
      .sort((a, b) => a.estimatedUsd - b.estimatedUsd);
  }

  /**
   * Get gas summary across all chains
   */
  getGasSummary() {
    const summary = {};
    for (const chain of Object.keys(this.gasPrices)) {
      const swap = this.estimateGasCost(chain, 'swap');
      const bridge = this.estimateGasCost(chain, 'bridge');
      summary[chain] = {
        swapCostUsd: swap.estimatedUsd,
        bridgeCostUsd: bridge.estimatedUsd,
        tier: swap.tier,
        minEfficientSwap: parseFloat((swap.estimatedUsd / this.maxGasRatio).toFixed(2)),
      };
    }
    return {
      chains: summary,
      maxGasRatio: (this.maxGasRatio * 100) + '%',
      lastUpdate: new Date(this.lastUpdate).toISOString(),
      note: 'Gas prices are estimates. Production: fetch live from RPC eth_gasPrice.',
    };
  }

  /**
   * Update gas prices (call periodically with live data)
   */
  updateGasPrice(chain, avgGwei, nativePrice) {
    if (this.gasPrices[chain]) {
      this.gasPrices[chain].avgGwei = avgGwei;
      if (nativePrice) this.gasPrices[chain].nativePrice = nativePrice;
      this.lastUpdate = Date.now();
    }
  }
}
