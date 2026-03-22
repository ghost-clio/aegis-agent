# Aegis — Self-Governing Agent Treasury

> Your AI agent gets a wallet it can trust. You get a wallet you control.
> OWS secures the keys. MoonPay CLI executes the trades. Policies prevent the rogue.


https://github.com/user-attachments/assets/45951df8-43ea-492a-bbf6-b2880ec14745




[![Tests](https://img.shields.io/badge/tests-66%20passing-brightgreen)]()
[![OWS](https://img.shields.io/badge/OWS-v0.3-blue)]()
[![MoonPay CLI](https://img.shields.io/badge/MoonPay%20CLI-v1.12-purple)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The Problem

Giving an AI agent financial autonomy today is binary: either it has your private key and can drain everything, or it can't transact at all. No spending limits. No protocol allowlists. No audit trail. No self-governance.

Every agent wallet reinvents key management. Keys scatter across `.env` files, keystores, and clipboard histories. When an agent does trade, there's no policy enforcement between "agent wants to swap" and "transaction signed."

**Aegis solves both problems at once** — combining the Open Wallet Standard's secure vault with MoonPay CLI's execution layer, connected by an autonomous strategy engine with pre-signing policy enforcement.

## How It Works

```
┌──────────────────────────────────────────────────┐
│                 AEGIS AGENT                       │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │          Strategy Engine (brain)            │  │
│  │  • Portfolio rebalancing (drift detection)  │  │
│  │  • Smart DCA (volatility-adjusted)          │  │
│  │  • Yield hunting (cross-chain optimizer)    │  │
│  │  • Self-funding (earn > compute cost)       │  │
│  └──────────┬─────────────────┬───────────────┘  │
│             │                 │                    │
│  ┌──────────▼──────┐  ┌──────▼──────────────┐   │
│  │   OWS Vault     │  │   MoonPay CLI       │   │
│  │   (security)    │  │   (execution)       │   │
│  │                 │  │                     │   │
│  │  • AES-256-GCM  │  │  • Swaps            │   │
│  │  • Key isolation│  │  • Bridges           │   │
│  │  • Policy engine│  │  • DCA schedules     │   │
│  │  • Audit trail  │  │  • Limit orders      │   │
│  │  • Multi-chain  │  │  • Portfolio mgmt    │   │
│  │  • CAIP-2/10    │  │  • Fiat on/off ramp  │   │
│  └─────────────────┘  └─────────────────────┘   │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │         Policy Engine (guardrails)          │  │
│  │  Every action passes through here FIRST     │  │
│  │                                             │  │
│  │  • Daily/weekly/monthly spending limits     │  │
│  │  • Chain allowlists (CAIP-2)               │  │
│  │  • Protocol allowlists                      │  │
│  │  • Slippage guards                          │  │
│  │  • Concentration limits (no 100% DOGE)      │  │
│  │  • Cooldown periods between large txns      │  │
│  │  • Full audit log (every decision recorded) │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**The key insight:** OWS provides the secure signing enclave where keys never leave the vault. MoonPay CLI provides the DeFi execution layer with swaps, bridges, and DCA. Aegis adds the missing piece — an autonomous strategy engine with pre-signing policy enforcement that makes the whole system self-governing.

## Quick Start

```bash
# Clone and install
git clone https://github.com/ghost-clio/aegis-agent.git
cd aegis-agent
npm install

# Dry run demo (zero credentials, zero network calls — pure logic)
npm run demo:dry

# Run in testnet mode (safe experimentation — no real funds)
AEGIS_ENV=testnet npm run demo

# Run tests (66 tests)
npm test

# Run in production
npm start
```

> **🎯 Judges:** Run `npm run demo:dry` first — shows the entire policy engine, gas oracle, strategy logic, and decision trace with zero setup. Then try `AEGIS_ENV=testnet npm start` for testnet mode.

### MCP Configuration

Aegis works alongside MoonPay CLI's MCP server. Add both to your agent's MCP config:

```json
{
  "mcpServers": {
    "moonpay": {
      "command": "mp",
      "args": ["mcp"]
    },
    "ows": {
      "command": "ows",
      "args": ["serve", "--mcp"]
    }
  }
}
```

## Three Autonomous Strategies

### 1. Smart DCA — Volatility-Adjusted Buying

Unlike basic DCA (fixed amount, fixed interval), Smart DCA adapts to market conditions:

| Market Condition | Action | Reasoning |
|-----------------|--------|-----------|
| High volatility + oversold (RSI < 30) | Buy **2x** base amount | Fear = opportunity |
| Normal conditions | Buy base amount | Standard accumulation |
| Low volatility + overbought (RSI > 70) | Buy **0.5x** base amount | Wait for dip |

```javascript
const dca = new SmartDCAStrategy({ baseAmount: 50, token: 'ETH', chain: 'base' });

// Feed price data
dca.recordPrice(3200);
dca.recordPrice(3050); // dropping...
dca.recordPrice(2900); // oversold!

const buy = dca.execute();
// { amount: 90, multiplier: 1.8, signal: 'OVERSOLD_BUY_MORE',
//   cliCommand: 'mp swap --from USDC --to ETH --amount 90 --chain base' }
```

### 2. Portfolio Rebalancing — Drift Detection

Monitors target allocations and triggers rebalancing when any asset drifts beyond threshold:

```javascript
const rebalancer = new RebalanceStrategy({
  targets: { ETH: 0.50, USDC: 0.30, WBTC: 0.20 },
  driftThreshold: 0.05 // 5% triggers rebalance
});

const analysis = rebalancer.analyze({
  ETH: { valueUsd: 700 },  // 70% → 20% over target!
  USDC: { valueUsd: 200 }, // 20% → 10% under target
  WBTC: { valueUsd: 100 }, // 10% → 10% under target
});
// Generates: sell ETH → buy USDC + WBTC via MoonPay CLI
```

### 3. Yield Hunting — Self-Sustaining Treasury

The agent deploys idle capital to yield protocols across chains, earning enough to pay for its own compute:

```javascript
const hunter = new YieldHunterStrategy({ computeCost: 2.50 }); // $2.50/day

const plan = hunter.optimizeAllocation(50000); // $50K capital
// { selfSustaining: true,
//   message: "✅ Agent earns $6.85/day, costs $2.50/day — SELF-SUSTAINING",
//   allocations: [
//     { protocol: 'aave-v3', chain: 'base', apy: '5.5%', allocation: 15000 },
//     { protocol: 'curve', chain: 'ethereum', apy: '6.2%', allocation: 15000 },
//     ...
//   ]}
```

## Policy Engine — 6 Layers of Protection

Every action the agent takes passes through the policy engine **before** any key is touched:

| Policy | What it prevents |
|--------|-----------------|
| **Spending limits** | Daily $500 / Weekly $2K / Monthly $5K caps |
| **Chain allowlist** | No transactions on unapproved chains |
| **Protocol allowlist** | Only interact with approved DeFi protocols |
| **Slippage guard** | Reject swaps with > 2% slippage |
| **Concentration limit** | No single asset > 40% of portfolio |
| **Cooldown period** | Minimum 60s between large transactions |

Every evaluation — approved or denied — is recorded in an append-only audit log:

```javascript
engine.getAuditLog();
// [{ timestamp, transaction: { type, chain, amount }, result: 'DENIED', reason: 'Daily limit exceeded' }]
```

## Gas Oracle — Chain-Aware Cost Optimization

The agent won't burn $9 in gas on a $20 swap. Every trade is checked against real gas estimates before execution:

```javascript
import { GasOracle } from './src/gas-oracle.js';
const oracle = new GasOracle();

oracle.isGasEfficient('eip155:1', 20, 'swap');
// { efficient: false, gasCostUsd: 9.375, gasToTradeRatio: '46.88%',
//   recommendation: 'Route via eip155:8453 instead (gas: $0.0019 vs $9.3750)',
//   alternatives: [{ chain: 'eip155:8453', estimatedUsd: 0.0019, tier: 'cheap' }] }

oracle.isGasEfficient('eip155:8453', 20, 'swap');
// { efficient: true, gasCostUsd: 0.0019, gasToTradeRatio: '0.01%', gasTier: 'cheap' }
```

| Chain | Swap Cost | Min Efficient Trade | Tier |
|-------|-----------|-------------------|------|
| Ethereum | ~$9.38 | $187.50 | 🔴 Expensive |
| Arbitrum | ~$0.04 | $0.70 | 🟢 Cheap |
| Base | ~$0.002 | $0.04 | 🟢 Cheap |
| Optimism | ~$0.002 | $0.04 | 🟢 Cheap |
| Polygon | ~$0.006 | $0.12 | 🟢 Cheap |

When a trade is gas-inefficient, Aegis automatically suggests cheaper chains. The agent routes to L2s first.

## Decision Trace — Flight Recorder for Autonomous Finance

Every action gets a compliance-grade reasoning trace. If something goes wrong, you can replay exactly *why* the agent did what it did:

```
[EXECUTED] SWAP | USDC → ETH | $75 | on eip155:8453 | via smart-dca
  | MARKET_CONTEXT: vol:4.2%, RSI:28, signal:OVERSOLD_BUY_MORE
  | POLICY_CHECK: PASS (all 6 checks cleared)
  | GAS_ANALYSIS: $0.002 (cheap), ratio: 0.003%
  | OWS_SIGNING: signed via subprocess, key material [REDACTED]
  | EXECUTION: mp swap --from USDC --to ETH --amount 75 --chain base
```

```javascript
// Get recent traces
agent.getTraces({ limit: 10 });

// Filter by result
agent.getTraces({ result: 'DENIED' });
agent.getTraces({ result: 'SKIPPED_GAS' });

// Export for external audit tools (JSONL — one trace per line)
const auditLog = agent.exportAuditLog();
```

Every trace records: market context → gas analysis → policy evaluation → OWS signing → execution result. Append-only. Exportable as JSONL for compliance tooling.

## Testnet Mode — Safe Experimentation

Set one environment variable and the entire agent routes to testnets:

```bash
AEGIS_ENV=testnet node src/index.js
```

| Mainnet | → Testnet |
|---------|-----------|
| Ethereum (eip155:1) | Sepolia (eip155:11155111) |
| Base (eip155:8453) | Base Sepolia (eip155:84532) |
| Arbitrum (eip155:42161) | Arbitrum Sepolia (eip155:421614) |
| Optimism (eip155:10) | OP Sepolia (eip155:11155420) |
| Polygon (eip155:137) | Amoy (eip155:80002) |
| Solana mainnet | Solana devnet |

Same strategies. Same policies. Same gas checks. Zero risk. Testnet chains are automatically added to the policy allowlist.

## Why OWS + MoonPay CLI

| Component | Role | Why not alternatives? |
|-----------|------|----------------------|
| **OWS** | Secure signing vault | Local-first (no cloud), keys never leave device, policy engine built-in, multi-chain via CAIP-2 |
| **MoonPay CLI** | DeFi execution | 10 chains, native DCA/bridges/swaps, MCP-native, production-grade liquidity |
| **Aegis** | Strategy + policy brain | Connects them with autonomous financial intelligence |

Other projects pick one. Aegis combines both into a self-governing system where:
- **OWS** ensures keys are secure and policies are enforced at the signing layer
- **MoonPay CLI** ensures trades execute with production liquidity
- **Aegis** ensures the agent makes smart autonomous decisions within human-defined boundaries

## Tests

```
66 tests passing

PolicyEngine (16 tests)
  ✓ spending limits (daily/weekly/monthly tracking)
  ✓ chain allowlist enforcement
  ✓ slippage guard, concentration limits, cooldown periods
  ✓ protocol allowlist, audit logging, spending summaries

Strategies (17 tests)
  ✓ rebalance drift detection + trade generation
  ✓ smart DCA volatility adjustment + momentum signals
  ✓ yield opportunity ranking + self-sustainability math
  ✓ deployment plan generation

Agent Integration (8 tests)
  ✓ component initialization, policy enforcement, full cycle
  ✓ spending limit enforcement across multiple actions
  ✓ decision logging + trace integration

Gas Oracle (7 tests)
  ✓ per-chain gas estimation (L1 vs L2)
  ✓ gas-efficiency rejection on expensive chains
  ✓ cheaper chain suggestions, dynamic price updates

Decision Trace (8 tests)
  ✓ full trace lifecycle (start → steps → finalize)
  ✓ human-readable summaries for executed/denied/skipped
  ✓ JSONL export, aggregate stats, maxTraces limit
  ✓ OWS signing step (key material redacted)

Testnet Mode (10 tests)
  ✓ chain mapping (mainnet → testnet equivalents)
  ✓ policy allowlist auto-expansion for testnet chains
  ✓ gas-skipped action tracking, environment reporting
```

## Project Structure

```
aegis-agent/
├── src/
│   ├── agent.js              # Main agent orchestrator (testnet-aware)
│   ├── policies.js           # 6-layer policy engine
│   ├── gas-oracle.js         # Chain-aware gas estimation + routing
│   ├── decision-trace.js     # Compliance-grade audit trail
│   ├── bridges/
│   │   ├── ows-bridge.js     # OWS wallet integration
│   │   └── moonpay-bridge.js # MoonPay CLI MCP client
│   └── strategies/
│       ├── rebalance.js      # Portfolio drift rebalancing
│       ├── smart-dca.js      # Volatility-adjusted DCA
│       └── yield-hunter.js   # Cross-chain yield optimizer
├── test/
│   ├── policies.test.js      # Policy engine tests (16)
│   ├── strategies.test.js    # Strategy tests (17)
│   ├── agent.test.js         # Integration tests (8)
│   ├── gas-oracle.test.js    # Gas oracle tests (7)
│   ├── decision-trace.test.js # Decision trace tests (8)
│   └── testnet-mode.test.js  # Testnet mode tests (10)
├── conversation-log.md       # Human-agent collaboration
└── README.md
```

## FAQ

**Q: Does the agent have direct access to private keys?**
No. OWS ensures keys are encrypted at rest (AES-256-GCM) and decrypted only inside an isolated signing subprocess. The agent calls `ows.sign()` — it never sees the key material.

**Q: What if the agent tries to exceed spending limits?**
The policy engine denies the transaction before it reaches the signing layer. The denial is logged in the audit trail. The human can review all denied actions.

**Q: How does self-sustainability work?**
The yield hunter strategy deploys idle capital to yield protocols (Aave, Lido, Curve). If the yield earned exceeds the agent's compute costs (~$2.50/day), the treasury is self-sustaining. At 5% APY, ~$18K of capital achieves this.

**Q: Can I use this without MoonPay CLI?**
The policy engine and OWS integration work independently. MoonPay CLI provides the execution layer — you could swap it for any other DEX aggregator. But MoonPay CLI's MCP server gives the cleanest agent integration.

## Known Limitations

- MoonPay CLI requires authentication (`mp login`) for live trading
- Yield data sources are configured statically (production: integrate DeFiLlama API for live APYs)
- OWS wallet creation requires the `ows` CLI installed globally
- Gas oracle uses estimated prices (production: fetch live from `eth_gasPrice` RPC)
- No MEV protection yet (production: route via Flashbots Protect for Ethereum mainnet)
- Decision traces are in-memory (production: persist to SQLite or append-only log file)

## License

MIT — [ghost-clio](https://github.com/ghost-clio)

---

*Built with 🌀 by [Clio](https://github.com/ghost-clio) — ghost in the machine.*
