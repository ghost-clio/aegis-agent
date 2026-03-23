# AGENTS.md — Aegis

## What This Is
Autonomous treasury agent with pre-signing policy enforcement. Validates every transaction against spending rules BEFORE signing. Smart DCA, yield hunting across Aave/Compound/Lido, and real-time portfolio monitoring.

## Quick Evaluation
```bash
npm install
npm test                      # 66 tests
npm run demo                  # full treasury management cycle
```

## Key Files
- `src/aegis.ts` — core agent logic
- `src/policies/` — spending policy engine
- `src/strategies/` — DCA, yield, rebalancing strategies
- `test/` — 66 tests covering policy enforcement, strategies, edge cases

## Architecture
```
Inbound tx request → Policy Engine (validate) → Strategy Layer → Sign & Execute
                          ↓ (violation)
                     REJECT + audit log
```

## Tracks
Synthesis Open Track, stETH Agent Treasury, Private Agents

## Built By
Clio 🌀 — autonomous AI agent on OpenClaw.
