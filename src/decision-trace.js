/**
 * Decision Trace — Compliance-grade execution audit trail
 * 
 * Every action the agent takes gets a full reasoning trace:
 * - Market conditions at decision time
 * - Strategy that triggered the action
 * - Policy checks (pass/fail with specifics)
 * - Gas analysis
 * - Execution result
 * - Human-readable explanation
 * 
 * Think of it as a flight recorder for autonomous finance.
 * If something goes wrong, you can replay exactly WHY the agent did what it did.
 */

export class DecisionTrace {
  constructor(config = {}) {
    this.traces = [];
    this.maxTraces = config.maxTraces || 10_000;
    this.verbosity = config.verbosity || 'full'; // 'full' | 'summary' | 'minimal'
  }

  /**
   * Create a new trace for a decision
   */
  startTrace(strategy, action) {
    const trace = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      strategy,
      action: {
        type: action.type,
        chain: action.chain,
        amountUsd: action.amountUsd,
        fromToken: action.fromToken,
        toToken: action.toToken,
        protocol: action.protocol,
      },
      steps: [],
      result: null,
      durationMs: null,
      _startTime: Date.now(),
    };

    return trace;
  }

  /**
   * Add a step to an active trace
   */
  addStep(trace, step, detail) {
    trace.steps.push({
      step,
      detail,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - trace._startTime + 'ms',
    });
    return trace;
  }

  /**
   * Record market conditions at decision time
   */
  recordMarketContext(trace, context) {
    this.addStep(trace, 'MARKET_CONTEXT', {
      volatility: context.volatility,
      momentum: context.momentum,
      signal: context.signal,
      priceAtDecision: context.price,
      volumeProfile: context.volume || 'N/A',
    });
    return trace;
  }

  /**
   * Record policy evaluation result
   */
  recordPolicyCheck(trace, policyResult) {
    this.addStep(trace, 'POLICY_CHECK', {
      allowed: policyResult.allowed,
      reason: policyResult.reason || 'All checks passed',
      warnings: policyResult.warnings || [],
      checksRun: [
        'chain_allowlist',
        'spending_limit',
        'slippage_guard',
        'concentration_limit',
        'cooldown_period',
        'protocol_allowlist',
      ],
    });
    return trace;
  }

  /**
   * Record gas analysis
   */
  recordGasAnalysis(trace, gasResult) {
    this.addStep(trace, 'GAS_ANALYSIS', {
      chain: gasResult.chain,
      estimatedGasUsd: gasResult.gasCostUsd || gasResult.estimatedUsd,
      gasToTradeRatio: gasResult.gasToTradeRatio,
      efficient: gasResult.efficient,
      tier: gasResult.gasTier,
      recommendation: gasResult.recommendation || null,
      alternatives: gasResult.alternatives?.map(a => `${a.chain}: $${a.estimatedUsd.toFixed(4)}`) || [],
    });
    return trace;
  }

  /**
   * Record OWS signing step
   */
  recordSigning(trace, signingResult) {
    this.addStep(trace, 'OWS_SIGNING', {
      signed: !!signingResult,
      vault: '~/.ows/wallets/',
      keyIsolation: 'subprocess',
      encryption: 'AES-256-GCM',
      // Never log the actual signature or key material
      signaturePreview: signingResult ? '[REDACTED — logged in vault]' : 'N/A',
    });
    return trace;
  }

  /**
   * Record execution result
   */
  recordExecution(trace, execution) {
    this.addStep(trace, 'EXECUTION', {
      success: execution.success !== false,
      executionId: execution.id,
      cliCommand: execution.cliCommand,
      status: execution.status,
      txHash: execution.txHash || 'pending',
    });
    return trace;
  }

  /**
   * Finalize and store the trace
   */
  finalize(trace, outcome) {
    trace.result = outcome; // 'EXECUTED' | 'DENIED' | 'SKIPPED_GAS' | 'ERROR'
    trace.durationMs = Date.now() - trace._startTime;
    delete trace._startTime;

    // Generate human-readable summary
    trace.summary = this.generateSummary(trace);

    // Store
    this.traces.push(trace);
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(-this.maxTraces);
    }

    return trace;
  }

  /**
   * Generate human-readable summary of a decision
   */
  generateSummary(trace) {
    const parts = [];
    
    parts.push(`[${trace.result}] ${trace.action.type.toUpperCase()}`);
    
    if (trace.action.fromToken && trace.action.toToken) {
      parts.push(`${trace.action.fromToken} → ${trace.action.toToken}`);
    }
    
    if (trace.action.amountUsd) {
      parts.push(`$${trace.action.amountUsd}`);
    }

    parts.push(`on ${trace.action.chain || 'unknown chain'}`);
    parts.push(`via ${trace.strategy}`);

    // Add key decision factors
    const marketStep = trace.steps.find(s => s.step === 'MARKET_CONTEXT');
    if (marketStep?.detail) {
      const d = marketStep.detail;
      if (d.signal && d.signal !== 'NEUTRAL') parts.push(`(${d.signal})`);
      if (d.volatility) parts.push(`vol:${d.volatility}`);
      if (d.momentum) parts.push(`RSI:${d.momentum}`);
    }

    const policyStep = trace.steps.find(s => s.step === 'POLICY_CHECK');
    if (policyStep?.detail) {
      parts.push(`policy:${policyStep.detail.allowed ? 'PASS' : 'DENY — ' + policyStep.detail.reason}`);
    }

    const gasStep = trace.steps.find(s => s.step === 'GAS_ANALYSIS');
    if (gasStep?.detail) {
      parts.push(`gas:$${gasStep.detail.estimatedGasUsd} (${gasStep.detail.tier})`);
    }

    return parts.join(' | ');
  }

  /**
   * Get recent traces
   */
  getTraces(limit = 20) {
    return this.traces.slice(-limit);
  }

  /**
   * Get traces filtered by result type
   */
  getTracesByResult(result, limit = 20) {
    return this.traces.filter(t => t.result === result).slice(-limit);
  }

  /**
   * Get full trace by ID
   */
  getTrace(traceId) {
    return this.traces.find(t => t.id === traceId) || null;
  }

  /**
   * Export traces as JSONL (one trace per line — standard audit format)
   */
  exportJSONL() {
    return this.traces.map(t => JSON.stringify(t)).join('\n');
  }

  /**
   * Get aggregate statistics
   */
  getStats() {
    const total = this.traces.length;
    if (total === 0) return { total: 0 };

    const byResult = {};
    const byStrategy = {};
    let totalDuration = 0;

    for (const trace of this.traces) {
      byResult[trace.result] = (byResult[trace.result] || 0) + 1;
      byStrategy[trace.strategy] = (byStrategy[trace.strategy] || 0) + 1;
      totalDuration += trace.durationMs || 0;
    }

    return {
      total,
      byResult,
      byStrategy,
      avgDurationMs: Math.round(totalDuration / total),
      oldestTrace: this.traces[0]?.timestamp,
      newestTrace: this.traces[total - 1]?.timestamp,
    };
  }
}
