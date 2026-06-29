# ci-conductor reporting

Reports test failures to ci-conductor's `/webhooks/failed-tests` webhook.

A per-suite adapter normalizes that suite's source data into a shared
`NormalizedTest` shape, which the core POSTs. The backend (hawk JUnit) adapter
is the one that exists.

Plain TypeScript, run directly with `bun` — no build step.

## Run

```bash
bun src/report-backend.ts   # parse target/junit and POST failures
bun test                    # unit tests
bun run type-check          # tsc --noEmit
```

The reporter no-ops unless `CI_CONDUCTOR_BASE_URL` is set, so it's safe to run
locally.
