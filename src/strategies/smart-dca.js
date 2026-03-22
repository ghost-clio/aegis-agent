/**
 * Smart DCA Strategy — Volatility-Adjusted Dollar Cost Averaging
 * 
 * Unlike basic DCA (fixed amounts at fixed intervals), Smart DCA:
 * - Buys MORE when volatility is high (fear = opportunity)
 * - Buys LESS when volatility is low (calm = wait)
 * - Adjusts timing based on RSI-like momentum signals
 * - Integrates with MoonPay CLI's native DCA + our custom logic
 */

export class SmartDCAStrategy {
  constructor(config = {}) {
    this.name = 'smart-dca';
    this.baseAmount = config.baseAmount || 50;       // Base buy amount in USD
    this.token = config.token || 'ETH';
    this.chain = config.chain || 'base';
    this.frequency = config.frequency || 'daily';
    this.volatilityMultiplier = config.volMult || 1.5; // Buy up to 1.5x on high vol
    this.priceHistory = [];
    this.executionHistory = [];
    this.maxMultiplier = 2.0;
    this.minMultiplier = 0.5;
  }

  /**
   * Record a price observation
   */
  recordPrice(price, timestamp = Date.now()) {
    this.priceHistory.push({ price, timestamp });
    // Keep last 30 days of prices
    const cutoff = Date.now() - 30 * 86400_000;
    this.priceHistory = this.priceHistory.filter(p => p.timestamp > cutoff);
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  calculateVolatility(lookback = 14) {
    if (this.priceHistory.length < 2) return 0;

    const prices = this.priceHistory.slice(-lookback);
    const returns = [];
    
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i].price - prices[i - 1].price) / prices[i - 1].price);
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate simple momentum (RSI-like)
   * Returns 0-100, below 30 = oversold (buy more), above 70 = overbought (buy less)
   */
  calculateMomentum(lookback = 14) {
    if (this.priceHistory.length < lookback + 1) return 50; // neutral

    const prices = this.priceHistory.slice(-lookback - 1);
    let gains = 0, losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i].price - prices[i - 1].price;
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (gains + losses === 0) return 50;
    return (gains / (gains + losses)) * 100;
  }

  /**
   * Determine the optimal buy amount based on market conditions
   */
  calculateBuyAmount() {
    const volatility = this.calculateVolatility();
    const momentum = this.calculateMomentum();

    let multiplier = 1.0;

    // High volatility → buy more (fear = opportunity)
    // Normalize vol: typical crypto daily vol is 2-5%, annualized 30-80%
    if (volatility > 0.04) multiplier += 0.3;
    if (volatility > 0.06) multiplier += 0.3;

    // Oversold (RSI < 30) → buy more
    if (momentum < 30) multiplier += 0.4;
    // Overbought (RSI > 70) → buy less
    else if (momentum > 70) multiplier -= 0.3;

    // Clamp
    multiplier = Math.max(this.minMultiplier, Math.min(this.maxMultiplier, multiplier));

    const amount = this.baseAmount * multiplier;

    return {
      amount: parseFloat(amount.toFixed(2)),
      baseAmount: this.baseAmount,
      multiplier: parseFloat(multiplier.toFixed(2)),
      volatility: parseFloat((volatility * 100).toFixed(2)) + '%',
      momentum: parseFloat(momentum.toFixed(0)),
      signal: momentum < 30 ? 'OVERSOLD_BUY_MORE' : 
              momentum > 70 ? 'OVERBOUGHT_BUY_LESS' : 'NEUTRAL',
      reasoning: this.explainDecision(multiplier, volatility, momentum),
    };
  }

  /**
   * Generate human-readable explanation of the DCA decision
   */
  explainDecision(multiplier, volatility, momentum) {
    const parts = [];
    
    if (multiplier > 1.2) {
      parts.push(`Buying ${((multiplier - 1) * 100).toFixed(0)}% MORE than base`);
    } else if (multiplier < 0.8) {
      parts.push(`Buying ${((1 - multiplier) * 100).toFixed(0)}% LESS than base`);
    } else {
      parts.push('Buying at base amount');
    }

    if (volatility > 0.04) parts.push(`high volatility (${(volatility * 100).toFixed(1)}%) = opportunity`);
    if (momentum < 30) parts.push(`oversold (RSI ${momentum.toFixed(0)}) = accumulate`);
    if (momentum > 70) parts.push(`overbought (RSI ${momentum.toFixed(0)}) = wait for dip`);

    return parts.join(' | ');
  }

  /**
   * Execute a DCA buy (returns MoonPay CLI command)
   */
  execute() {
    const calc = this.calculateBuyAmount();
    
    const execution = {
      timestamp: new Date().toISOString(),
      token: this.token,
      chain: this.chain,
      ...calc,
      cliCommand: `mp swap --from USDC --to ${this.token} --amount ${calc.amount} --chain ${this.chain}`,
    };

    this.executionHistory.push(execution);
    return execution;
  }

  getPerformance() {
    if (this.executionHistory.length === 0) return { totalInvested: 0, buys: 0 };
    
    return {
      totalInvested: this.executionHistory.reduce((s, e) => s + e.amount, 0),
      buys: this.executionHistory.length,
      avgBuyAmount: this.executionHistory.reduce((s, e) => s + e.amount, 0) / this.executionHistory.length,
      lastBuy: this.executionHistory[this.executionHistory.length - 1],
    };
  }
}
