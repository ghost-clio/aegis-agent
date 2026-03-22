import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PolicyEngine } from '../src/policies.js';

describe('PolicyEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new PolicyEngine({
      spendingLimits: { daily: { usd: 100 }, weekly: { usd: 500 }, monthly: { usd: 1500 } },
      maxSlippage: 0.02,
      cooldownMs: 5000,
      largeTransactionThreshold: 50,
    });
  });

  describe('spending limits', () => {
    it('allows transactions within daily limit', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 50, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, true);
    });

    it('denies transactions exceeding daily limit', () => {
      engine.recordTransaction({ amountUsd: 80, type: 'swap', chain: 'eip155:1' });
      const result = engine.evaluate({ type: 'swap', amountUsd: 30, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('Daily limit'));
    });

    it('warns at 80% of daily limit', () => {
      engine.recordTransaction({ amountUsd: 75, type: 'swap', chain: 'eip155:1' });
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, true);
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings[0].includes('Approaching daily limit'));
    });

    it('tracks weekly spending across multiple days', () => {
      // Spend $400 in "previous days" (simulate by recording)
      for (let i = 0; i < 8; i++) {
        engine.recordTransaction({ amountUsd: 50, type: 'swap', chain: 'eip155:1' });
      }
      // This $150 would exceed weekly $500
      const result = engine.evaluate({ type: 'swap', amountUsd: 150, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, false);
    });
  });

  describe('chain allowlist', () => {
    it('allows transactions on approved chains', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, true);
    });

    it('denies transactions on unapproved chains', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:666' });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('not in allowlist'));
    });
  });

  describe('slippage guard', () => {
    it('allows swaps within slippage tolerance', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1', slippage: 0.01 });
      assert.strictEqual(result.allowed, true);
    });

    it('denies swaps with excessive slippage', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1', slippage: 0.05 });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('Slippage'));
    });
  });

  describe('concentration limit', () => {
    it('denies swaps that would over-concentrate', () => {
      const result = engine.evaluate({
        type: 'swap', amountUsd: 10, chain: 'eip155:1',
        resultingConcentration: 0.60, targetAsset: 'ETH',
      });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('concentration'));
    });

    it('allows swaps within concentration limit', () => {
      const result = engine.evaluate({
        type: 'swap', amountUsd: 10, chain: 'eip155:1',
        resultingConcentration: 0.30, targetAsset: 'ETH',
      });
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('cooldown period', () => {
    it('enforces cooldown between large transactions', () => {
      // Use a fresh engine with high spending limits to isolate cooldown test
      const cooldownEngine = new PolicyEngine({
        spendingLimits: { daily: { usd: 10000 }, weekly: { usd: 50000 }, monthly: { usd: 100000 } },
        cooldownMs: 60000,
        largeTransactionThreshold: 50,
      });
      cooldownEngine.recordTransaction({ amountUsd: 60, type: 'swap', chain: 'eip155:1' });
      const result = cooldownEngine.evaluate({ type: 'swap', amountUsd: 60, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('Cooldown'), `Expected cooldown denial, got: ${result.reason}`);
    });

    it('allows small transactions during cooldown', () => {
      engine.recordTransaction({ amountUsd: 60, type: 'swap', chain: 'eip155:1' });
      const result = engine.evaluate({ type: 'swap', amountUsd: 20, chain: 'eip155:1' });
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('protocol allowlist', () => {
    it('allows approved protocols', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1', protocol: 'uniswap-v3' });
      assert.strictEqual(result.allowed, true);
    });

    it('denies unapproved protocols', () => {
      const result = engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1', protocol: 'shadyswap' });
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('not in allowlist'));
    });
  });

  describe('audit log', () => {
    it('records all evaluations', () => {
      engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:1' });
      engine.evaluate({ type: 'swap', amountUsd: 10, chain: 'eip155:666' });
      
      const log = engine.getAuditLog();
      assert.strictEqual(log.length, 2);
      assert.strictEqual(log[0].result, 'APPROVED');
      assert.strictEqual(log[1].result, 'DENIED');
    });
  });

  describe('spending summary', () => {
    it('tracks daily/weekly/monthly spending', () => {
      engine.recordTransaction({ amountUsd: 25, type: 'swap', chain: 'eip155:1' });
      engine.recordTransaction({ amountUsd: 35, type: 'bridge', chain: 'eip155:8453' });

      const summary = engine.getSpendingSummary();
      assert.strictEqual(summary.daily.spent, 60);
      assert.strictEqual(summary.daily.limit, 100);
      assert.strictEqual(summary.weekly.spent, 60);
    });
  });
});
