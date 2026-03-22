/**
 * Aegis Agent — Self-Governing Agent Treasury
 * 
 * The brain that orchestrates:
 * - OWS (wallet security + signing + policies)
 * - MoonPay CLI (swap/bridge/DCA execution)
 * - Strategy Engine (rebalance, smart DCA, yield hunting)
 * - Gas Oracle (chain-aware cost optimization)
 * - Decision Trace (compliance-grade audit trail)
 * 
 * The agent manages its own treasury autonomously while
 * the human sleeps. Policies prevent it from going rogue.
 */

import { PolicyEngine } from './policies.js';
import { OWSBridge } from './bridges/ows-bridge.js';
import { MoonPayBridge } from './bridges/moonpay-bridge.js';
import { RebalanceStrategy } from './strategies/rebalance.js';
import { SmartDCAStrategy } from './strategies/smart-dca.js';
import { YieldHunterStrategy } from './strategies/yield-hunter.js';
import { GasOracle } from './gas-oracle.js';
import { DecisionTrace } from './decision-trace.js';

// Environment detection
const AEGIS_ENV = process.env.AEGIS_ENV || 'mainnet';
const IS_TESTNET = ['testnet', 'test', 'demo'].includes(AEGIS_ENV.toLowerCase());

// Chain mapping: mainnet → testnet equivalents
const TESTNET_CHAINS = {
  'eip155:1':     'eip155:11155111',  // Ethereum → Sepolia
  'eip155:8453':  'eip155:84532',     // Base → Base Sepolia
  'eip155:42161': 'eip155:421614',    // Arbitrum → Arbitrum Sepolia
  'eip155:10':    'eip155:11155420',  // Optimism → OP Sepolia
  'eip155:137':   'eip155:80002',     // Polygon → Amoy
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Solana → devnet
};

export class AegisAgent {
  constructor(config = {}) {
    // Environment
    this.env = AEGIS_ENV;
    this.isTestnet = IS_TESTNET;

    // Core components
    this.ows = new OWSBridge(config.walletName || 'aegis-treasury');
    this.moonpay = new MoonPayBridge(config.moonpay);

    // In testnet mode, auto-add testnet chains to policy allowlist
    const policyConfig = { ...config.policies };
    if (this.isTestnet) {
      const testnetChainIds = Object.values(TESTNET_CHAINS);
      const existing = policyConfig.allowedChains || [];
      policyConfig.allowedChains = [...new Set([...existing, ...testnetChainIds])];
    }

    this.policies = new PolicyEngine(policyConfig);
    this.gasOracle = new GasOracle(config.gas);
    this.decisionTrace = new DecisionTrace(config.trace);

    // Strategies
    this.strategies = {
      rebalance: new RebalanceStrategy(config.rebalance),
      smartDCA: new SmartDCAStrategy(config.dca),
      yieldHunter: new YieldHunterStrategy(config.yield),
    };

    // Agent state
    this.state = {
      initialized: false,
      running: false,
      env: this.env,
      isTestnet: this.isTestnet,
      lastAction: null,
      actionsExecuted: 0,
      actionsDenied: 0,
      actionsSkippedGas: 0,
    };

    // Decision log — full transparency for the human
    this.decisionLog = [];
  }

  /**
   * Resolve chain ID — maps mainnet chains to testnet if AEGIS_ENV=testnet
   */
  resolveChain(chain) {
    if (!this.isTestnet || !chain) return chain;
    return TESTNET_CHAINS[chain] || chain;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    const results = {};

    // Initialize OWS wallet vault
    try {
      results.ows = await this.ows.initialize();
    } catch (e) {
      results.ows = { success: false, error: e.message };
    }

    // Connect to MoonPay CLI MCP server
    try {
      results.moonpay = await this.moonpay.connect();
    } catch (e) {
      results.moonpay = { success: false, error: e.message };
    }

    this.state.initialized = true;
    
    this.logDecision({
      type: 'INITIALIZE',
      env: this.env,
      isTestnet: this.isTestnet,
      chainMapping: this.isTestnet ? TESTNET_CHAINS : 'mainnet (no mapping)',
      components: results,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      agent: 'aegis',
      env: this.env,
      isTestnet: this.isTestnet,
      components: results,
      strategies: Object.keys(this.strategies),
      policies: this.policies.policies,
      gasOracle: this.gasOracle.getGasSummary(),
    };
  }

  /**
   * Run one cycle of the agent loop
   * Called periodically (every minute, every hour, etc.)
   */
  async runCycle(portfolio) {
    if (!this.state.initialized) throw new Error('Agent not initialized');
    
    const cycle = {
      timestamp: new Date().toISOString(),
      env: this.env,
      actions: [],
      decisions: [],
      traces: [],
    };

    // 1. Check portfolio rebalancing
    const rebalanceAnalysis = this.strategies.rebalance.analyze(portfolio);
    if (rebalanceAnalysis.needsRebalance) {
      const trades = this.strategies.rebalance.generateTrades(rebalanceAnalysis);
      for (const trade of trades) {
        const chain = this.resolveChain(trade.chain || 'eip155:8453');

        // Start decision trace
        const trace = this.decisionTrace.startTrace('rebalance', {
          type: 'swap', chain, amountUsd: trade.amountUsd,
          fromToken: trade.fromToken, toToken: trade.toToken, protocol: 'moonpay',
        });

        // Gas check first
        const gasCheck = this.gasOracle.isGasEfficient(chain, trade.amountUsd, 'rebalance');
        this.decisionTrace.recordGasAnalysis(trace, gasCheck);

        if (!gasCheck.efficient) {
          this.decisionTrace.finalize(trace, 'SKIPPED_GAS');
          cycle.decisions.push({
            strategy: 'rebalance', action: 'SKIPPED_GAS',
            reason: gasCheck.recommendation, trade,
          });
          cycle.traces.push(trace);
          this.state.actionsSkippedGas++;
          continue;
        }

        // Policy check
        const policyResult = this.policies.evaluate({
          type: 'swap', chain, amountUsd: trade.amountUsd,
          protocol: 'moonpay', slippage: 0.005,
        });
        this.decisionTrace.recordPolicyCheck(trace, policyResult);

        if (policyResult.allowed) {
          const execution = await this.moonpay.swap({
            fromToken: trade.fromToken, toToken: trade.toToken,
            amount: trade.amountUsd, chain,
          });
          this.decisionTrace.recordExecution(trace, execution);
          this.decisionTrace.finalize(trace, 'EXECUTED');
          this.policies.recordTransaction({ type: 'swap', amountUsd: trade.amountUsd, chain });
          cycle.actions.push({ strategy: 'rebalance', execution, reason: trade.reason, trace: trace.summary });
          this.state.actionsExecuted++;
        } else {
          this.decisionTrace.finalize(trace, 'DENIED');
          cycle.decisions.push({
            strategy: 'rebalance', action: 'DENIED',
            reason: policyResult.reason, trade,
          });
          this.state.actionsDenied++;
        }
        cycle.traces.push(trace);
      }
    }

    // 2. Run Smart DCA if scheduled
    const dcaChain = this.resolveChain('eip155:8453');
    const dcaCalc = this.strategies.smartDCA.calculateBuyAmount();
    
    // Start DCA trace
    const dcaTrace = this.decisionTrace.startTrace('smart-dca', {
      type: 'swap', chain: dcaChain, amountUsd: dcaCalc.amount,
      fromToken: 'USDC', toToken: this.strategies.smartDCA.token, protocol: 'moonpay',
    });
    this.decisionTrace.recordMarketContext(dcaTrace, {
      volatility: dcaCalc.volatility, momentum: dcaCalc.momentum, signal: dcaCalc.signal,
    });

    // Gas check for DCA
    const dcaGasCheck = this.gasOracle.isGasEfficient(dcaChain, dcaCalc.amount);
    this.decisionTrace.recordGasAnalysis(dcaTrace, dcaGasCheck);

    const dcaPolicyResult = this.policies.evaluate({
      type: 'swap', chain: dcaChain, amountUsd: dcaCalc.amount, protocol: 'moonpay',
    });
    this.decisionTrace.recordPolicyCheck(dcaTrace, dcaPolicyResult);

    const dcaResult = !dcaGasCheck.efficient ? 'SKIPPED_GAS' : 
                      !dcaPolicyResult.allowed ? 'DENIED' : 'EVALUATED';
    this.decisionTrace.finalize(dcaTrace, dcaResult);

    cycle.decisions.push({
      strategy: 'smart-dca', calculation: dcaCalc,
      gasEfficient: dcaGasCheck.efficient, gasCost: dcaGasCheck.gasCostUsd,
      policyResult: dcaPolicyResult.allowed ? 'APPROVED' : 'DENIED',
      policyReason: dcaPolicyResult.reason,
      trace: dcaTrace.summary,
    });
    cycle.traces.push(dcaTrace);

    // 3. Analyze yield opportunities
    const yieldAnalysis = this.strategies.yieldHunter.optimizeAllocation(
      Object.values(portfolio).reduce((sum, pos) => sum + (pos.valueUsd || 0), 0) * 0.3
    );
    cycle.decisions.push({ strategy: 'yield-hunter', analysis: yieldAnalysis });

    // Record cycle
    this.state.lastAction = cycle.timestamp;
    this.logDecision({ type: 'CYCLE', ...cycle });

    return cycle;
  }

  /**
   * Execute a single action (swap, bridge, DCA) with full tracing
   */
  async executeAction(action) {
    const chain = this.resolveChain(action.chain);
    const tracedAction = { ...action, chain };

    // Start trace
    const trace = this.decisionTrace.startTrace(action.strategy || 'manual', tracedAction);

    // Gas check
    const gasCheck = this.gasOracle.isGasEfficient(chain, action.amountUsd, action.type);
    this.decisionTrace.recordGasAnalysis(trace, gasCheck);

    if (!gasCheck.efficient) {
      this.decisionTrace.finalize(trace, 'SKIPPED_GAS');
      this.state.actionsSkippedGas++;
      return {
        success: false, skippedGas: true,
        reason: gasCheck.recommendation,
        gasCostUsd: gasCheck.gasCostUsd,
        alternatives: gasCheck.alternatives,
        trace: trace.summary,
      };
    }

    // Policy check
    const policyResult = this.policies.evaluate(tracedAction);
    this.decisionTrace.recordPolicyCheck(trace, policyResult);
    
    if (!policyResult.allowed) {
      this.decisionTrace.finalize(trace, 'DENIED');
      this.state.actionsDenied++;
      return { success: false, denied: true, reason: policyResult.reason, trace: trace.summary };
    }

    // Execute via MoonPay CLI
    let execution;
    switch (action.type) {
      case 'swap':
        execution = await this.moonpay.swap({ ...action, chain });
        break;
      case 'bridge':
        execution = await this.moonpay.bridge(action);
        break;
      case 'dca':
        execution = await this.moonpay.setupDCA(action);
        break;
      case 'limit-order':
        execution = await this.moonpay.limitOrder(action);
        break;
      default:
        this.decisionTrace.finalize(trace, 'ERROR');
        return { success: false, reason: `Unknown action type: ${action.type}` };
    }

    this.decisionTrace.recordExecution(trace, execution);

    // Sign via OWS if needed
    if (action.requiresSigning) {
      const signature = await this.ows.sign(chain, action.txData);
      execution.signature = signature;
      this.decisionTrace.recordSigning(trace, signature);
    }

    this.decisionTrace.finalize(trace, 'EXECUTED');
    this.policies.recordTransaction(tracedAction);
    this.state.actionsExecuted++;

    return {
      success: true, execution,
      warnings: policyResult.warnings,
      gasCost: gasCheck.gasCostUsd,
      trace: trace.summary,
    };
  }

  /**
   * Get full agent status dashboard data
   */
  getStatus() {
    return {
      agent: 'aegis',
      version: '1.1.0',
      env: this.env,
      isTestnet: this.isTestnet,
      chainMapping: this.isTestnet ? 'Active — all chains routed to testnets' : 'Disabled — mainnet',
      state: this.state,
      wallet: this.ows.getWalletInfo(),
      spending: this.policies.getSpendingSummary(),
      gas: this.gasOracle.getGasSummary(),
      strategies: {
        rebalance: { active: true },
        smartDCA: {
          active: true,
          performance: this.strategies.smartDCA.getPerformance(),
        },
        yieldHunter: {
          active: true,
          summary: this.strategies.yieldHunter.getSummary(),
        },
      },
      auditLog: this.policies.getAuditLog().slice(-10),
      decisionTrace: {
        stats: this.decisionTrace.getStats(),
        recent: this.decisionTrace.getTraces(5).map(t => t.summary),
      },
    };
  }

  /**
   * Get decision traces (for audit / debugging)
   */
  getTraces(options = {}) {
    if (options.id) return this.decisionTrace.getTrace(options.id);
    if (options.result) return this.decisionTrace.getTracesByResult(options.result, options.limit);
    return this.decisionTrace.getTraces(options.limit || 20);
  }

  /**
   * Export traces as JSONL for external audit tools
   */
  exportAuditLog() {
    return this.decisionTrace.exportJSONL();
  }

  logDecision(decision) {
    this.decisionLog.push({
      ...decision,
      timestamp: decision.timestamp || new Date().toISOString(),
    });
  }
}
