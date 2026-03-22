import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AegisAgent } from '../src/agent.js';

describe('Testnet Mode', () => {
  it('detects mainnet by default', () => {
    delete process.env.AEGIS_ENV;
    // Need to reimport to pick up env change — test the resolveChain logic directly
    const agent = new AegisAgent();
    // Default should be mainnet (since we can't reimport easily, test resolveChain)
    assert.strictEqual(agent.resolveChain('eip155:1'), 'eip155:1');
  });

  it('maps mainnet chains to testnets when AEGIS_ENV=testnet', () => {
    const agent = new AegisAgent();
    agent.isTestnet = true; // Force testnet mode for testing
    
    assert.strictEqual(agent.resolveChain('eip155:1'), 'eip155:11155111');     // → Sepolia
    assert.strictEqual(agent.resolveChain('eip155:8453'), 'eip155:84532');     // → Base Sepolia
    assert.strictEqual(agent.resolveChain('eip155:42161'), 'eip155:421614');   // → Arb Sepolia
    assert.strictEqual(agent.resolveChain('eip155:10'), 'eip155:11155420');    // → OP Sepolia
    assert.strictEqual(agent.resolveChain('eip155:137'), 'eip155:80002');      // → Amoy
  });

  it('passes through unknown chains unchanged', () => {
    const agent = new AegisAgent();
    agent.isTestnet = true;
    assert.strictEqual(agent.resolveChain('eip155:99999'), 'eip155:99999');
  });

  it('does not map chains on mainnet', () => {
    const agent = new AegisAgent();
    agent.isTestnet = false;
    assert.strictEqual(agent.resolveChain('eip155:1'), 'eip155:1');
    assert.strictEqual(agent.resolveChain('eip155:8453'), 'eip155:8453');
  });

  it('reports environment in status', async () => {
    const agent = new AegisAgent();
    agent.isTestnet = true;
    agent.env = 'testnet';
    await agent.initialize();
    
    const status = agent.getStatus();
    assert.strictEqual(status.env, 'testnet');
    assert.strictEqual(status.isTestnet, true);
    assert.ok(status.chainMapping.includes('testnet'));
  });

  it('reports mainnet in status by default', async () => {
    const agent = new AegisAgent();
    await agent.initialize();
    
    const status = agent.getStatus();
    assert.strictEqual(status.isTestnet, false);
    assert.strictEqual(status.chainMapping, 'Disabled — mainnet');
  });

  it('uses testnet chains in executeAction', async () => {
    // Set env before construction so policies include testnet chains
    const origEnv = process.env.AEGIS_ENV;
    process.env.AEGIS_ENV = 'testnet';
    // Dynamic import to pick up env
    const { AegisAgent: TestnetAgent } = await import('../src/agent.js?t=' + Date.now());
    const agent = new TestnetAgent();
    agent.isTestnet = true;
    // Also add testnet chains to policies manually since module-level const was cached
    const testnetChains = ['eip155:11155111','eip155:84532','eip155:421614','eip155:11155420','eip155:80002'];
    for (const c of testnetChains) {
      if (!agent.policies.policies.allowedChains.includes(c)) {
        agent.policies.policies.allowedChains.push(c);
      }
    }
    await agent.initialize();
    process.env.AEGIS_ENV = origEnv;
    
    const result = await agent.executeAction({
      type: 'swap',
      chain: 'eip155:8453', // mainnet Base
      amountUsd: 50,
      fromToken: 'USDC',
      toToken: 'ETH',
      protocol: 'moonpay',
    });
    
    // The trace should show the resolved testnet chain
    assert.ok(result.trace, 'Should have trace summary');
    // Action succeeded (gas is cheap on Base)
    assert.strictEqual(result.success, true);
  });

  it('includes gas oracle in initialization', async () => {
    const agent = new AegisAgent();
    await agent.initialize();
    
    const status = agent.getStatus();
    assert.ok(status.gas, 'Should include gas oracle summary');
    assert.ok(status.gas.chains, 'Should have per-chain gas data');
    assert.ok(status.gas.chains['eip155:1'], 'Should include Ethereum');
    assert.ok(status.gas.chains['eip155:8453'], 'Should include Base');
  });

  it('includes decision trace stats in status', async () => {
    const agent = new AegisAgent();
    await agent.initialize();
    
    const status = agent.getStatus();
    assert.ok(status.decisionTrace, 'Should include decision trace');
    assert.ok(status.decisionTrace.stats !== undefined);
  });

  it('tracks gas-skipped actions in state', async () => {
    const agent = new AegisAgent();
    await agent.initialize();
    
    // Try a tiny trade on Ethereum — should be skipped for gas
    const result = await agent.executeAction({
      type: 'swap',
      chain: 'eip155:1', // Ethereum mainnet — expensive
      amountUsd: 5,       // tiny trade
      fromToken: 'USDC',
      toToken: 'ETH',
      protocol: 'moonpay',
    });
    
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.skippedGas, true);
    assert.ok(result.alternatives?.length > 0, 'Should suggest cheaper chains');
    assert.strictEqual(agent.state.actionsSkippedGas, 1);
  });
});
