# ci-conductor reporting

Shared module for reporting test failures to **ci-conductor** (`/webhooks/failed-tests`).

Today the same transport/identity/contract code is duplicated across the backend,
e2e, and (soon) frontend test suites. This package consolidates it behind an
**adapter pattern**:

```
normalizer  = (source data) → NormalizedTest[]          // per-suite, source-specific
core        = NormalizedTest[] → report / quarantine     // shared, one copy
```

The suites legitimately differ in **what** they collect and **when**, but the
payload POSTed to ci-conductor **must be identical in shape**. So each suite has
a `normalize*` function that produces `NormalizedTest[]`, and both downstream
consumers — `reportTestFailures` (the POST) and, later,
`checkFailuresAgainstQuarantine` (the gate) — read that same shape, so the report
path and the quarantine path can never disagree on a test's identity.

## Layout

```
src/
├── contract.ts        the NormalizedTest shape (the agreement both report and
│                      quarantine read). Types only for now; runtime validation
│                      is a close follow-up.
├── transport.ts       reportTestFailures() — resolves the run-level context
│                      (repo/run/job/sha/branch) and POSTs /webhooks/failed-tests
│                      (quarantine fetch/gate joins this later)
├── util.ts            toNumber() / log()
├── report-junit.ts    backend entrypoint (bun src/report-junit.ts)
└── adapters/
    └── junit.ts       normalizeBackendJunit(): hawk JUnit XML → NormalizedTest[]
```

The **jest** (frontend) and **cypress** (e2e) normalizers
(`normalizeFrontendJunit` / `normalizeCypressFailure`) land in later rounds
(DEV-2247 and the e2e port), reusing this same core.

## Run

```bash
bun src/report-junit.ts   # parse target/junit and POST failures
bun test                  # unit tests
bun run type-check        # tsc --noEmit
```

No build step — these are plain TS files run directly with `bun`. The reporter
no-ops unless `CI_CONDUCTOR_BASE_URL` is set, so it's safe to run locally.
