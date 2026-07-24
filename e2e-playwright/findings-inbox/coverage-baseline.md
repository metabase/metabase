# coverage-baseline

Source: `e2e/test/scenarios/coverage-baseline.cy.spec.js` (18 lines, 1 test)
Target: `tests/coverage-baseline.spec.ts` — **1 passed, 0 skipped** (2/2 under `--repeat-each=2`)
Jar `751c2a98`, slot 4105. `bunx tsc --noEmit` clean.

## It is not a product spec — it is instrumentation scaffolding

The brief's suspicion was right. This file exists to feed the selective-e2e
coverage pipeline, and the repo says so explicitly:

- `.github/scripts/e2e-spec-globs.mjs` exports it as `BASELINE_SPEC`, and
  `listSpecFiles()` passes it in `ignore:` — so it is excluded from the spec
  "universe" the test planner selects from *and* from the coverage-manifest
  backfill reconciliation. Its comment: *"This is the nightly-only baseline
  helper that runs in the instrumented pass to capture boot-time coverage. It is
  not a product spec."*
- `e2e/support/config.js:250` registers an `after:spec` hook (active under
  `INSTRUMENT_COVERAGE=true`) that writes per-spec raw coverage into
  `e2e/coverage-manifest-raw`.
- `e2e/coverage/build-coverage-manifest.mjs` then subtracts **this spec's**
  function counters from every other spec's, keeping only files whose counters
  strictly exceeded the baseline — i.e. stripping eager-loaded boot modules.

Its value is entirely in the coverage counters its *run* produces. Its
assertions are incidental.

## Decision: ported, with the caveat attached

Ported faithfully and 1:1 (restore → sign in as admin → `goto("/")` → assert
`app-bar` and `home-page` visible). The body is a genuine, if minimal,
sign-in-and-load-home smoke test, it runs in <1s, and porting keeps the spec
inventory a clean 1:1 mapping.

**But the port does not reproduce the original's function.** The Playwright
harness has no coverage instrumentation and no `after:spec` hook feeding
`e2e/coverage-manifest-raw`, so nothing consumes this run.

Two consequences the orchestrator should carry forward:

1. **Do not count this as migrating the coverage pipeline.** If the Cypress
   coverage manifest survives the migration, the Cypress original must survive
   with it — deleting `coverage-baseline.cy.spec.js` on the strength of this
   port would silently break `build-coverage-manifest.mjs`'s baseline
   subtraction, and the breakage would surface as *wrong selective-test plans*,
   not as a failing test.
2. Migrating the pipeline itself is a separate piece of work (Playwright would
   need its own coverage collection + a baseline-subtracting manifest builder).
   Worth flagging in the spike write-up as a Cypress-side dependency the
   migration has not addressed.

## Mutation check: input inversion, mutant killed

Replacing `mb.signInAsAdmin()` with `mb.signOut()` → `goto("/")` lands on the
login page and `app-bar` is never visible; test fails. So both assertions
depend on the signed-in state the spec's name claims to establish.
