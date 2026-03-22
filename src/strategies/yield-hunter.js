/**
 * Yield Hunter Strategy — Cross-chain yield optimization
 * 
 * Monitors yield opportunities across chains and protocols,
 * automatically bridges + deploys capital to the best yields.
 * 
 * The agent earns yield to pay for its own compute costs — 
 * a self-sustaining autonomous treasury.
 */

export class YieldHunterStrategy {
  constructor(config = {}) {
    this.name = 'yield-hunter';
    this.minYield = config.minYield || 0.03;          // 3% minimum APY
    this.maxProtocolExposure = config.maxExposure || 0.30; // 30% max to one protocol
    this.yieldSources = config.sources || [
      { protocol: 'aave-v3', chain: 'ethereum', asset: 'USDC', apy: 0.048, risk: 'low' },
      { protocol: 'aave-v3', chain: 'base', asset: 'USDC', apy: 0.055, risk: 'low' },
      { protocol: 'aave-v3', chain: 'arbitrum', asset: 'USDC', apy: 0.052, risk: 'low' },
      { protocol: 'lido', chain: 'ethereum', asset: 'ETH', apy: 0.036, risk: 'low' },
      { protocol: 'curve', chain: 'ethereum', asset: 'USDC', apy: 0.062, risk: 'medium' },
      { protocol: 'uniswap-v3', chain: 'base', asset: 'ETH-USDC', apy: 0.12, risk: 'medium' },
    ];
    this.deployments = [];
    this.yieldEarned = 0;
    this.computeCostPerDay = config.computeCost || 2.50; // $2.50/day agent compute
  }

  /**
   * Analyze available yields and rank by risk-adjusted return
   */
  analyzeOpportunities() {
    const riskMultipliers = { low: 1.0, medium: 0.7, high: 0.4 };

    const ranked = this.yieldSources
      .filter(s => s.apy >= this.minYield)
      .map(source => ({
        ...source,
        apyPercent: (source.apy * 100).toFixed(2) + '%',
        riskAdjustedApy: source.apy * (riskMultipliers[source.risk] || 0.5),
        riskAdjustedApyPercent: ((source.apy * (riskMultipliers[source.risk] || 0.5)) * 100).toFixed(2) + '%',
      }))
      .sort((a, b) => b.riskAdjustedApy - a.riskAdjustedApy);

    return {
      opportunities: ranked,
      bestOpportunity: ranked[0],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate optimal allocation across yield sources
   */
  optimizeAllocation(totalCapitalUsd) {
    const analysis = this.analyzeOpportunities();
    const allocations = [];
    let remaining = totalCapitalUsd;

    for (const opp of analysis.opportunities) {
      if (remaining <= 0) break;

      const maxAllocation = totalCapitalUsd * this.maxProtocolExposure;
      const allocation = Math.min(remaining, maxAllocation);

      allocations.push({
        protocol: opp.protocol,
        chain: opp.chain,
        asset: opp.asset,
        allocationUsd: parseFloat(allocation.toFixed(2)),
        expectedAnnualYield: parseFloat((allocation * opp.apy).toFixed(2)),
        expectedDailyYield: parseFloat((allocation * opp.apy / 365).toFixed(4)),
        apy: opp.apyPercent,
        risk: opp.risk,
      });

      remaining -= allocation;
    }

    const totalDailyYield = allocations.reduce((s, a) => s + a.expectedDailyYield, 0);
    const selfSustaining = totalDailyYield >= this.computeCostPerDay;

    return {
      allocations,
      totalAllocated: parseFloat((totalCapitalUsd - remaining).toFixed(2)),
      unallocated: parseFloat(remaining.toFixed(2)),
      expectedAnnualYield: parseFloat(allocations.reduce((s, a) => s + a.expectedAnnualYield, 0).toFixed(2)),
      expectedDailyYield: parseFloat(totalDailyYield.toFixed(4)),
      computeCostPerDay: this.computeCostPerDay,
      selfSustaining,
      selfSustainingMessage: selfSustaining 
        ? `✅ Agent earns $${totalDailyYield.toFixed(2)}/day, costs $${this.computeCostPerDay}/day — SELF-SUSTAINING`
        : `⚠️ Agent earns $${totalDailyYield.toFixed(2)}/day but costs $${this.computeCostPerDay}/day — needs $${((this.computeCostPerDay - totalDailyYield) * 365).toFixed(0)} more capital`,
    };
  }

  /**
   * Generate bridge + deposit commands for redeployment
   */
  generateDeploymentPlan(currentChain, allocation) {
    const steps = [];

    for (const alloc of allocation.allocations) {
      // Bridge if needed
      if (alloc.chain !== currentChain) {
        steps.push({
          step: 'bridge',
          command: `mp bridge --token ${alloc.asset.split('-')[0]} --amount ${alloc.allocationUsd} --from ${currentChain} --to ${alloc.chain}`,
          description: `Bridge $${alloc.allocationUsd} to ${alloc.chain}`,
        });
      }

      // Deposit into yield protocol
      steps.push({
        step: 'deposit',
        protocol: alloc.protocol,
        chain: alloc.chain,
        amount: alloc.allocationUsd,
        description: `Deposit $${alloc.allocationUsd} into ${alloc.protocol} on ${alloc.chain} (${alloc.apy} APY)`,
      });
    }

    return {
      steps,
      totalSteps: steps.length,
      estimatedGas: steps.length * 0.50, // rough estimate
    };
  }

  /**
   * Track yield earned
   */
  recordYield(amount) {
    this.yieldEarned += amount;
    return { totalYieldEarned: this.yieldEarned };
  }

  getSummary() {
    return {
      strategy: this.name,
      minYield: (this.minYield * 100) + '%',
      maxProtocolExposure: (this.maxProtocolExposure * 100) + '%',
      totalYieldEarned: this.yieldEarned,
      deployments: this.deployments.length,
      computeCostPerDay: this.computeCostPerDay,
    };
  }
}
