/**
 * Aegis Policy Engine — Pre-signing policy enforcement for OWS wallets
 * 
 * Extends OWS's built-in policy engine with agent-specific financial policies:
 * - Per-chain spending limits (daily/weekly/monthly)
 * - Protocol allowlists (only interact with approved contracts)
 * - Slippage guards (reject swaps with excessive slippage)
 * - Concentration limits (no single asset > X% of portfolio)
 * - Cool-down periods (minimum time between large transactions)
 */

export class PolicyEngine {
  constructor(config = {}) {
    this.policies = {
      spendingLimits: config.spendingLimits || {
        daily: { usd: 500 },
        weekly: { usd: 2000 },
        monthly: { usd: 5000 }
      },
      allowedProtocols: config.allowedProtocols || [
        'uniswap-v3', 'uniswap-v4', 'aave-v3', 'lido', 
        'curve', '1inch', 'moonpay'
      ],
      allowedChains: config.allowedChains || [
        'eip155:1',    // Ethereum
        'eip155:8453', // Base
        'eip155:137',  // Polygon
        'eip155:42161', // Arbitrum
        'eip155:10',   // Optimism
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Solana mainnet
      ],
      maxSlippage: config.maxSlippage || 0.02, // 2%
      maxConcentration: config.maxConcentration || 0.40, // 40% max in one asset
      cooldownMs: config.cooldownMs || 60_000, // 1 min between large txns
      largeTransactionThreshold: config.largeTransactionThreshold || 100, // $100+
    };

    this.spendingHistory = [];
    this.lastLargeTransaction = 0;
    this.auditLog = [];
  }

  /**
   * Evaluate a transaction against all policies
   * Returns { allowed: bool, reason?: string, warnings: string[] }
   */
  evaluate(transaction) {
    const result = { allowed: true, reason: null, warnings: [] };
    const checks = [
      this.checkChainAllowed,
      this.checkSpendingLimit,
      this.checkSlippage,
      this.checkConcentration,
      this.checkCooldown,
      this.checkProtocolAllowed,
    ];

    for (const check of checks) {
      const checkResult = check.call(this, transaction);
      if (!checkResult.allowed) {
        result.allowed = false;
        result.reason = checkResult.reason;
        break;
      }
      if (checkResult.warning) {
        result.warnings.push(checkResult.warning);
      }
    }

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      transaction: {
        type: transaction.type,
        chain: transaction.chain,
        amount: transaction.amountUsd,
        protocol: transaction.protocol,
      },
      result: result.allowed ? 'APPROVED' : 'DENIED',
      reason: result.reason,
      warnings: result.warnings,
    });

    return result;
  }

  checkChainAllowed(tx) {
    if (tx.chain && !this.policies.allowedChains.includes(tx.chain)) {
      return { allowed: false, reason: `Chain ${tx.chain} not in allowlist` };
    }
    return { allowed: true };
  }

  checkSpendingLimit(tx) {
    if (!tx.amountUsd) return { allowed: true };

    const now = Date.now();
    const day = 86400000;
    
    const dailySpent = this.spendingHistory
      .filter(h => now - h.timestamp < day)
      .reduce((sum, h) => sum + h.amountUsd, 0);

    const weeklySpent = this.spendingHistory
      .filter(h => now - h.timestamp < 7 * day)
      .reduce((sum, h) => sum + h.amountUsd, 0);

    const monthlySpent = this.spendingHistory
      .filter(h => now - h.timestamp < 30 * day)
      .reduce((sum, h) => sum + h.amountUsd, 0);

    if (dailySpent + tx.amountUsd > this.policies.spendingLimits.daily.usd) {
      return { allowed: false, reason: `Daily limit exceeded: $${dailySpent.toFixed(2)} + $${tx.amountUsd.toFixed(2)} > $${this.policies.spendingLimits.daily.usd}` };
    }

    if (weeklySpent + tx.amountUsd > this.policies.spendingLimits.weekly.usd) {
      return { allowed: false, reason: `Weekly limit exceeded` };
    }

    if (monthlySpent + tx.amountUsd > this.policies.spendingLimits.monthly.usd) {
      return { allowed: false, reason: `Monthly limit exceeded` };
    }

    // Warning at 80% of daily
    if ((dailySpent + tx.amountUsd) / this.policies.spendingLimits.daily.usd > 0.8) {
      return { allowed: true, warning: `Approaching daily limit (${((dailySpent + tx.amountUsd) / this.policies.spendingLimits.daily.usd * 100).toFixed(0)}%)` };
    }

    return { allowed: true };
  }

  checkSlippage(tx) {
    if (tx.type !== 'swap' || !tx.slippage) return { allowed: true };
    if (tx.slippage > this.policies.maxSlippage) {
      return { allowed: false, reason: `Slippage ${(tx.slippage * 100).toFixed(1)}% exceeds max ${(this.policies.maxSlippage * 100).toFixed(1)}%` };
    }
    return { allowed: true };
  }

  checkConcentration(tx) {
    if (tx.type !== 'swap' || !tx.resultingConcentration) return { allowed: true };
    if (tx.resultingConcentration > this.policies.maxConcentration) {
      return {
        allowed: false,
        reason: `Would result in ${(tx.resultingConcentration * 100).toFixed(0)}% concentration in ${tx.targetAsset}, max is ${(this.policies.maxConcentration * 100).toFixed(0)}%`
      };
    }
    return { allowed: true };
  }

  checkCooldown(tx) {
    if (!tx.amountUsd || tx.amountUsd < this.policies.largeTransactionThreshold) {
      return { allowed: true };
    }
    const elapsed = Date.now() - this.lastLargeTransaction;
    if (elapsed < this.policies.cooldownMs) {
      const remaining = Math.ceil((this.policies.cooldownMs - elapsed) / 1000);
      return { allowed: false, reason: `Cooldown active: ${remaining}s remaining between large transactions` };
    }
    return { allowed: true };
  }

  checkProtocolAllowed(tx) {
    if (tx.protocol && !this.policies.allowedProtocols.includes(tx.protocol)) {
      return { allowed: false, reason: `Protocol ${tx.protocol} not in allowlist` };
    }
    return { allowed: true };
  }

  /**
   * Record a completed transaction for history tracking
   */
  recordTransaction(tx) {
    this.spendingHistory.push({
      timestamp: Date.now(),
      amountUsd: tx.amountUsd || 0,
      chain: tx.chain,
      type: tx.type,
    });

    if (tx.amountUsd >= this.policies.largeTransactionThreshold) {
      this.lastLargeTransaction = Date.now();
    }
  }

  getAuditLog() {
    return this.auditLog;
  }

  getSpendingSummary() {
    const now = Date.now();
    const day = 86400000;
    return {
      daily: {
        spent: this.spendingHistory.filter(h => now - h.timestamp < day).reduce((s, h) => s + h.amountUsd, 0),
        limit: this.policies.spendingLimits.daily.usd,
      },
      weekly: {
        spent: this.spendingHistory.filter(h => now - h.timestamp < 7 * day).reduce((s, h) => s + h.amountUsd, 0),
        limit: this.policies.spendingLimits.weekly.usd,
      },
      monthly: {
        spent: this.spendingHistory.filter(h => now - h.timestamp < 30 * day).reduce((s, h) => s + h.amountUsd, 0),
        limit: this.policies.spendingLimits.monthly.usd,
      },
    };
  }
}
