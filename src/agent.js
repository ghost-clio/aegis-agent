/**
 * Aegis Agent — Self-Governing Agent Treasury
 * 
 * The brain that orchestrates:
 * - OWS (wallet security + signing + policies)
 * - MoonPay CLI (swap/bridge/DCA execution)
 * - Strategy Engine (rebalance, smart DCA, yield hunting)
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

export class AegisAgent {
  constructor(config = {}) {
    // Core components
    this.ows = new OWSBridge(config.walletName || 'aegis-treasury');
    this.moonpay = new MoonPayBridge(config.moonpay);
    this.policies = new PolicyEngine(config.policies);

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
      lastAction: null,
      actionsExecuted: 0,
      actionsDenied: 0,
    };

    // Decision log — full transparency for the human
    this.decisionLog = [];
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
      components: results,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      agent: 'aegis',
      components: results,
      strategies: Object.keys(this.strategies),
      policies: this.policies.policies,
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
      actions: [],
      decisions: [],
    };

    // 1. Check portfolio rebalancing
    const rebalanceAnalysis = this.strategies.rebalance.analyze(portfolio);
    if (rebalanceAnalysis.needsRebalance) {
      const trades = this.strategies.rebalance.generateTrades(rebalanceAnalysis);
      for (const trade of trades) {
        const policyResult = this.policies.evaluate({
          type: 'swap',
          chain: `eip155:8453`, // base
          amountUsd: trade.amountUsd,
          protocol: 'moonpay',
          slippage: 0.005,
        });

        if (policyResult.allowed) {
          const execution = await this.moonpay.swap({
            fromToken: trade.fromToken,
            toToken: trade.toToken,
            amount: trade.amountUsd,
            chain: trade.chain,
          });
          this.policies.recordTransaction({ type: 'swap', amountUsd: trade.amountUsd, chain: trade.chain });
          cycle.actions.push({ strategy: 'rebalance', execution, reason: trade.reason });
          this.state.actionsExecuted++;
        } else {
          cycle.decisions.push({
            strategy: 'rebalance',
            action: 'DENIED',
            reason: policyResult.reason,
            trade,
          });
          this.state.actionsDenied++;
        }
      }
    }

    // 2. Run Smart DCA if scheduled
    const dcaCalc = this.strategies.smartDCA.calculateBuyAmount();
    const dcaPolicyResult = this.policies.evaluate({
      type: 'swap',
      chain: 'eip155:8453',
      amountUsd: dcaCalc.amount,
      protocol: 'moonpay',
    });

    cycle.decisions.push({
      strategy: 'smart-dca',
      calculation: dcaCalc,
      policyResult: dcaPolicyResult.allowed ? 'APPROVED' : 'DENIED',
      policyReason: dcaPolicyResult.reason,
    });

    // 3. Analyze yield opportunities
    const yieldAnalysis = this.strategies.yieldHunter.optimizeAllocation(
      Object.values(portfolio).reduce((sum, pos) => sum + (pos.valueUsd || 0), 0) * 0.3 // 30% to yield
    );
    cycle.decisions.push({
      strategy: 'yield-hunter',
      analysis: yieldAnalysis,
    });

    // Record cycle
    this.state.lastAction = cycle.timestamp;
    this.logDecision({ type: 'CYCLE', ...cycle });

    return cycle;
  }

  /**
   * Execute a single action (swap, bridge, DCA) with policy enforcement
   */
  async executeAction(action) {
    // Policy check first
    const policyResult = this.policies.evaluate(action);
    
    if (!policyResult.allowed) {
      this.state.actionsDenied++;
      this.logDecision({
        type: 'ACTION_DENIED',
        action,
        reason: policyResult.reason,
      });
      return { success: false, denied: true, reason: policyResult.reason };
    }

    // Execute via MoonPay CLI
    let execution;
    switch (action.type) {
      case 'swap':
        execution = await this.moonpay.swap(action);
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
        return { success: false, reason: `Unknown action type: ${action.type}` };
    }

    // Record spending
    this.policies.recordTransaction(action);
    this.state.actionsExecuted++;

    // Sign via OWS if needed
    if (action.requiresSigning) {
      const signature = await this.ows.sign(action.chain || 'evm', action.txData);
      execution.signature = signature;
    }

    this.logDecision({
      type: 'ACTION_EXECUTED',
      action,
      execution,
      warnings: policyResult.warnings,
    });

    return { success: true, execution, warnings: policyResult.warnings };
  }

  /**
   * Get full agent status dashboard data
   */
  getStatus() {
    return {
      agent: 'aegis',
      version: '1.0.0',
      state: this.state,
      wallet: this.ows.getWalletInfo(),
      spending: this.policies.getSpendingSummary(),
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
      auditLog: this.policies.getAuditLog().slice(-10), // last 10
      decisionLog: this.decisionLog.slice(-10),
    };
  }

  logDecision(decision) {
    this.decisionLog.push({
      ...decision,
      timestamp: decision.timestamp || new Date().toISOString(),
    });
  }
}
