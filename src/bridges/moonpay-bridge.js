/**
 * MoonPay CLI Bridge — Connects Aegis to MoonPay's MCP server
 * 
 * MoonPay CLI provides: swaps, bridges, DCA, portfolio tracking,
 * fiat on/off ramps, limit orders, stop losses across 10+ chains.
 * 
 * We use it as the EXECUTION layer — OWS handles signing,
 * MoonPay handles the what/where/when of DeFi operations.
 */

export class MoonPayBridge {
  constructor(config = {}) {
    this.connected = false;
    this.capabilities = [
      'swap', 'bridge', 'dca', 'portfolio', 
      'fiat-onramp', 'fiat-offramp', 'limit-order',
      'stop-loss', 'balance-check', 'price-feed'
    ];
    this.supportedChains = [
      'ethereum', 'base', 'polygon', 'arbitrum', 'optimism',
      'avalanche', 'bsc', 'solana', 'bitcoin', 'fantom'
    ];
    this.executionLog = [];
  }

  /**
   * Connect to MoonPay CLI MCP server
   * In production: spawns `mp mcp` and communicates via MCP protocol
   * Generates MoonPay CLI commands for execution. In dry-run mode, returns command without executing.
   */
  async connect() {
    this.connected = true;
    return { 
      success: true, 
      server: 'moonpay-cli',
      version: '1.12.4',
      capabilities: this.capabilities,
      chains: this.supportedChains,
    };
  }

  /**
   * Execute a swap via MoonPay CLI
   */
  async swap({ fromToken, toToken, amount, chain, slippageTolerance = 0.005 }) {
    this.validateConnected();
    
    const execution = {
      id: this.generateId(),
      type: 'swap',
      timestamp: new Date().toISOString(),
      params: { fromToken, toToken, amount, chain, slippageTolerance },
      // MoonPay CLI command: mp swap --from ETH --to USDC --amount 0.5 --chain base
      cliCommand: `mp swap --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${chain} --slippage ${slippageTolerance}`,
      status: 'pending',
    };

    this.executionLog.push(execution);
    return execution;
  }

  /**
   * Execute a cross-chain bridge via MoonPay CLI
   */
  async bridge({ token, amount, fromChain, toChain }) {
    this.validateConnected();

    const execution = {
      id: this.generateId(),
      type: 'bridge',
      timestamp: new Date().toISOString(),
      params: { token, amount, fromChain, toChain },
      cliCommand: `mp bridge --token ${token} --amount ${amount} --from ${fromChain} --to ${toChain}`,
      status: 'pending',
    };

    this.executionLog.push(execution);
    return execution;
  }

  /**
   * Set up a DCA (Dollar-Cost Averaging) schedule
   */
  async setupDCA({ token, amount, frequency, chain, duration }) {
    this.validateConnected();

    const execution = {
      id: this.generateId(),
      type: 'dca',
      timestamp: new Date().toISOString(),
      params: { token, amount, frequency, chain, duration },
      cliCommand: `mp dca --token ${token} --amount ${amount} --frequency ${frequency} --chain ${chain} --duration ${duration}`,
      status: 'active',
      schedule: {
        nextExecution: this.getNextDCATime(frequency),
        remaining: this.calculateDCAExecutions(frequency, duration),
      },
    };

    this.executionLog.push(execution);
    return execution;
  }

  /**
   * Get portfolio balances across all chains
   */
  async getPortfolio() {
    this.validateConnected();
    // mp portfolio --all-chains
    return {
      cliCommand: 'mp portfolio --all-chains',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get token price
   */
  async getPrice(token, chain = 'ethereum') {
    this.validateConnected();
    return {
      cliCommand: `mp price ${token} --chain ${chain}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Set up limit order
   */
  async limitOrder({ fromToken, toToken, amount, targetPrice, chain }) {
    this.validateConnected();

    const execution = {
      id: this.generateId(),
      type: 'limit-order',
      timestamp: new Date().toISOString(),
      params: { fromToken, toToken, amount, targetPrice, chain },
      cliCommand: `mp limit --from ${fromToken} --to ${toToken} --amount ${amount} --price ${targetPrice} --chain ${chain}`,
      status: 'active',
    };

    this.executionLog.push(execution);
    return execution;
  }

  /**
   * Fiat on-ramp (buy crypto with fiat)
   */
  async onramp({ currency, amount, token, chain }) {
    this.validateConnected();

    return {
      id: this.generateId(),
      type: 'onramp',
      timestamp: new Date().toISOString(),
      params: { currency, amount, token, chain },
      cliCommand: `mp buy --currency ${currency} --amount ${amount} --token ${token} --chain ${chain}`,
      status: 'pending',
    };
  }

  getExecutionLog() {
    return this.executionLog;
  }

  validateConnected() {
    if (!this.connected) throw new Error('MoonPay bridge not connected. Call connect() first.');
  }

  generateId() {
    return `aegis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  getNextDCATime(frequency) {
    const intervals = { hourly: 3600, daily: 86400, weekly: 604800 };
    const seconds = intervals[frequency] || 86400;
    return new Date(Date.now() + seconds * 1000).toISOString();
  }

  calculateDCAExecutions(frequency, duration) {
    const intervals = { hourly: 3600, daily: 86400, weekly: 604800 };
    const durations = { '1w': 604800, '1m': 2592000, '3m': 7776000 };
    return Math.floor((durations[duration] || 2592000) / (intervals[frequency] || 86400));
  }
}
