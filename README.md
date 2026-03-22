# Aegis — Self-Governing Agent Treasury

> Your AI agent gets a wallet it can trust. You get a wallet you control.
> OWS secures the keys. MoonPay CLI executes the trades. Policies prevent the rogue.

[![Tests](https://img.shields.io/badge/tests-41%20passing-brightgreen)]()
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

# Run tests (41 tests)
npm test

# Run demo
npm run demo
```

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
41 tests passing

PolicyEngine (16 tests)
  ✓ spending limits (daily/weekly/monthly tracking)
  ✓ chain allowlist enforcement
  ✓ slippage guard
  ✓ concentration limits
  ✓ cooldown periods
  ✓ protocol allowlist
  ✓ audit logging
  ✓ spending summaries

Strategies (17 tests)
  ✓ rebalance drift detection
  ✓ smart DCA volatility adjustment
  ✓ yield opportunity ranking
  ✓ self-sustainability calculation
  ✓ deployment plan generation

Agent Integration (8 tests)
  ✓ component initialization
  ✓ policy enforcement on actions
  ✓ full agent cycle execution
  ✓ spending limit enforcement across actions
  ✓ decision logging transparency
```

## Project Structure

```
aegis-agent/
├── src/
│   ├── agent.js              # Main agent orchestrator
│   ├── policies.js           # 6-layer policy engine
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
│   └── agent.test.js         # Integration tests (8)
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
- Yield data sources are configured statically (production would use live APY feeds)
- OWS wallet creation requires the `ows` CLI installed globally
- Cross-chain bridging adds gas costs not reflected in strategy calculations

## License

MIT — [ghost-clio](https://github.com/ghost-clio)

---

*Built with 🌀 by [Clio](https://github.com/ghost-clio) — ghost in the machine.*
