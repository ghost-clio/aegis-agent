import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DecisionTrace } from '../src/decision-trace.js';

describe('DecisionTrace', () => {
  it('creates and finalizes a trace', () => {
    const dt = new DecisionTrace();
    const trace = dt.startTrace('smart-dca', {
      type: 'swap', chain: 'eip155:8453', amountUsd: 75,
      fromToken: 'USDC', toToken: 'ETH', protocol: 'moonpay',
    });
    
    dt.recordMarketContext(trace, {
      volatility: '4.2%', momentum: 28, signal: 'OVERSOLD_BUY_MORE',
    });
    dt.recordPolicyCheck(trace, { allowed: true, warnings: [] });
    dt.recordGasAnalysis(trace, {
      estimatedUsd: 0.002, gasToTradeRatio: '0.003%', efficient: true, gasTier: 'cheap',
    });
    dt.recordExecution(trace, {
      id: 'aegis-123', cliCommand: 'mp swap --from USDC --to ETH', status: 'pending',
    });
    
    const finalized = dt.finalize(trace, 'EXECUTED');
    assert.strictEqual(finalized.result, 'EXECUTED');
    assert.ok(finalized.durationMs >= 0);
    assert.ok(finalized.summary.includes('EXECUTED'));
    assert.ok(finalized.summary.includes('SWAP'));
    assert.strictEqual(finalized.steps.length, 4);
  });

  it('generates readable summaries for denied actions', () => {
    const dt = new DecisionTrace();
    const trace = dt.startTrace('rebalance', {
      type: 'swap', chain: 'eip155:1', amountUsd: 600,
      fromToken: 'ETH', toToken: 'USDC', protocol: 'moonpay',
    });
    
    dt.recordPolicyCheck(trace, {
      allowed: false, reason: 'Daily limit exceeded: $450 + $600 > $500',
    });
    
    const finalized = dt.finalize(trace, 'DENIED');
    assert.ok(finalized.summary.includes('DENIED'));
    assert.ok(finalized.summary.includes('Daily limit'));
  });

  it('tracks gas-skipped actions', () => {
    const dt = new DecisionTrace();
    const trace = dt.startTrace('rebalance', {
      type: 'swap', chain: 'eip155:1', amountUsd: 15,
    });
    
    dt.recordGasAnalysis(trace, {
      estimatedUsd: 9.38, gasToTradeRatio: '62.5%', efficient: false,
      gasTier: 'expensive', recommendation: 'Route via eip155:8453',
    });
    
    const finalized = dt.finalize(trace, 'SKIPPED_GAS');
    assert.strictEqual(finalized.result, 'SKIPPED_GAS');
    assert.ok(finalized.summary.includes('SKIPPED_GAS'));
  });

  it('retrieves traces by result type', () => {
    const dt = new DecisionTrace();
    
    for (let i = 0; i < 3; i++) {
      const t = dt.startTrace('dca', { type: 'swap', amountUsd: 50 });
      dt.finalize(t, 'EXECUTED');
    }
    for (let i = 0; i < 2; i++) {
      const t = dt.startTrace('rebalance', { type: 'swap', amountUsd: 200 });
      dt.finalize(t, 'DENIED');
    }
    
    assert.strictEqual(dt.getTracesByResult('EXECUTED').length, 3);
    assert.strictEqual(dt.getTracesByResult('DENIED').length, 2);
  });

  it('exports JSONL format', () => {
    const dt = new DecisionTrace();
    const t1 = dt.startTrace('dca', { type: 'swap' });
    dt.finalize(t1, 'EXECUTED');
    const t2 = dt.startTrace('rebalance', { type: 'swap' });
    dt.finalize(t2, 'DENIED');
    
    const jsonl = dt.exportJSONL();
    const lines = jsonl.split('\n');
    assert.strictEqual(lines.length, 2);
    assert.ok(JSON.parse(lines[0]).result === 'EXECUTED');
    assert.ok(JSON.parse(lines[1]).result === 'DENIED');
  });

  it('computes aggregate stats', () => {
    const dt = new DecisionTrace();
    for (let i = 0; i < 5; i++) {
      const t = dt.startTrace(i < 3 ? 'dca' : 'rebalance', { type: 'swap' });
      dt.finalize(t, i < 4 ? 'EXECUTED' : 'DENIED');
    }
    
    const stats = dt.getStats();
    assert.strictEqual(stats.total, 5);
    assert.strictEqual(stats.byResult.EXECUTED, 4);
    assert.strictEqual(stats.byResult.DENIED, 1);
    assert.strictEqual(stats.byStrategy.dca, 3);
    assert.strictEqual(stats.byStrategy.rebalance, 2);
  });

  it('records OWS signing step (redacts key material)', () => {
    const dt = new DecisionTrace();
    const trace = dt.startTrace('manual', { type: 'swap' });
    dt.recordSigning(trace, { sig: '0xdeadbeef...' });
    
    const sigStep = trace.steps.find(s => s.step === 'OWS_SIGNING');
    assert.ok(sigStep);
    assert.ok(sigStep.detail.signaturePreview.includes('REDACTED'));
    assert.strictEqual(sigStep.detail.encryption, 'AES-256-GCM');
  });

  it('respects maxTraces limit', () => {
    const dt = new DecisionTrace({ maxTraces: 5 });
    for (let i = 0; i < 10; i++) {
      const t = dt.startTrace('dca', { type: 'swap' });
      dt.finalize(t, 'EXECUTED');
    }
    assert.strictEqual(dt.getTraces(100).length, 5);
  });
});
