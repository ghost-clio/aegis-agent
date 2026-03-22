import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GasOracle } from '../src/gas-oracle.js';

describe('GasOracle', () => {
  it('estimates gas for different chains', () => {
    const oracle = new GasOracle();
    const ethGas = oracle.estimateGasCost('eip155:1', 'swap');
    const baseGas = oracle.estimateGasCost('eip155:8453', 'swap');
    
    // Ethereum should be WAY more expensive than Base
    assert.ok(ethGas.estimatedUsd > baseGas.estimatedUsd * 100,
      `ETH gas ($${ethGas.estimatedUsd}) should be >100x Base gas ($${baseGas.estimatedUsd})`);
    assert.strictEqual(ethGas.tier, 'expensive');
    assert.strictEqual(baseGas.tier, 'cheap');
  });

  it('rejects gas-inefficient trades on L1', () => {
    const oracle = new GasOracle();
    // $20 swap on Ethereum mainnet — gas eats too much
    const result = oracle.isGasEfficient('eip155:1', 20, 'swap');
    assert.strictEqual(result.efficient, false);
    assert.ok(result.recommendation, 'Should suggest alternative');
  });

  it('approves trades on L2', () => {
    const oracle = new GasOracle();
    // $20 swap on Base — gas is negligible
    const result = oracle.isGasEfficient('eip155:8453', 20, 'swap');
    assert.strictEqual(result.efficient, true);
  });

  it('suggests cheaper chains', () => {
    const oracle = new GasOracle();
    const alternatives = oracle.findCheaperChain(50, 'swap');
    assert.ok(alternatives.length > 0, 'Should find cheap chains');
    // Base should be among the cheapest
    assert.ok(alternatives.some(a => a.chain === 'eip155:8453'));
  });

  it('handles bridge gas (higher than swap)', () => {
    const oracle = new GasOracle();
    const swap = oracle.estimateGasCost('eip155:1', 'swap');
    const bridge = oracle.estimateGasCost('eip155:1', 'bridge');
    assert.ok(bridge.estimatedUsd > swap.estimatedUsd, 'Bridge should cost more than swap');
  });

  it('returns full gas summary', () => {
    const oracle = new GasOracle();
    const summary = oracle.getGasSummary();
    assert.ok(summary.chains['eip155:1']);
    assert.ok(summary.chains['eip155:8453']);
    assert.ok(summary.maxGasRatio);
    // Minimum efficient swap on ETH should be high
    assert.ok(summary.chains['eip155:1'].minEfficientSwap > 50,
      'ETH min efficient swap should be >$50');
  });

  it('updates gas prices dynamically', () => {
    const oracle = new GasOracle();
    const before = oracle.estimateGasCost('eip155:1', 'swap');
    oracle.updateGasPrice('eip155:1', 50, 3000); // double the gas
    const after = oracle.estimateGasCost('eip155:1', 'swap');
    assert.ok(after.estimatedUsd > before.estimatedUsd, 'Higher gas price should increase cost');
  });
});
