# ci-conductor reporting

Shared module for reporting test failures to **ci-conductor** (`/webhooks/failed-tests`).

Today the same transport/identity/contract code is duplicated across the backend,
e2e, and (soon) frontend test suites. This package consolidates it behind an
**adapter pattern**:

```
Adapter  = (source data) → CanonicalTest[]          // per-suite, source-specific
Core     = CanonicalTest[] → transport / identity   // shared, one copy
```

The suites legitimately differ in **what** they collect and **when**, but the
payload POSTed to ci-conductor **must be identical in shape**. So each suite gets
an adapter that produces the canonical shape; everything downstream is shared.

## Layout

```
src/
├── contract.ts        canonical payload shape (the hub). Types only for now;
│                      runtime validation is a close follow-up.
├── identity.ts        runContext() / toNumber() — shared run-level identity
├── transport.ts       postFailedTests() — the /webhooks/failed-tests POST
├── report-junit.ts    backend entrypoint (bun src/report-junit.ts)
└── adapters/
    └── junit.ts       backend (Clojure/hawk JUnit XML) → CanonicalTest[]
```

The **jest** (frontend) and **cypress** (e2e) adapters land in later rounds
(DEV-2247 and the e2e port), reusing this same core.

## Run

```bash
bun src/report-junit.ts   # parse target/junit and POST failures
bun test                  # unit tests
bun run type-check        # tsc --noEmit
```

No build step — these are plain TS files run directly with `bun`. The reporter
no-ops unless `CI_CONDUCTOR_BASE_URL` is set, so it's safe to run locally.
