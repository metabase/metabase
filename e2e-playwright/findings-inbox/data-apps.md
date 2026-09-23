# data-apps (sandbox + viewing)

Ports of the new upstream "data apps" specs:
- `e2e/test/scenarios/data-apps/sandbox.cy.spec.ts` (210 lines, 6 tests)
  → `tests/data-apps-sandbox.spec.ts`
- `e2e/test/scenarios/data-apps/viewing.cy.spec.ts` (170 lines, 8 tests)
  → `tests/data-apps-viewing.spec.ts`
- new domain module `support/data-apps.ts` (rule 9)

Slot 2 / port 4102. Jar verified **by identity**: `/api/session/properties`
`version.hash = 1d91fb2` (task expected `1d91fb2b`), `date 2026-07-21`. The run
log said `ready in 34s` (a genuinely fresh boot after I killed 4102 and
`rm -rf`'d the slot dir), so `JAR_PATH` was honoured, not silently ignored.

## Headline — BLOCKED on a stale local snapshot, NOT a missing feature

The data-apps feature **is present and unlocked on the CI jar**, but every
data-apps route 500s because the local `default` snapshot predates the
data_app schema migration. The two ports are written faithfully and are
**tsc-clean**, but they **cannot be run to green on this box** until
`e2e/snapshots/default.sql` is regenerated — which I could not safely do
(6 sibling slots live + a Cypress run in progress). This is **not** the
FINDINGS #49 "fully-gated new feature" shape: I did not gate everything to
fake green; the token gate is legitimate and the real, external blocker is
reported below with evidence.

## Evidence the feature IS present and unlocked

- `token-features` after `activateToken("bleeding-edge")` (MB_ALL_FEATURES_TOKEN,
  resolved from cypress.env.json, activated 2xx) contains **`data-apps: true`**.
- The BE route `/embed/apps/:slug` **exists and executes** — it does not 404. It
  runs a real query against the `DATA_APP` table (see below), i.e. the routing +
  handler code is in the jar.

## The blocker — `Table "DATA_APP" not found` after restore

`GET /embed/apps/kitchen-sink` on the freshly-booted jar backend returns
**HTTP 500**:

```
Table "DATA_APP" not found; SQL statement:
SELECT "DATA_APP"."ID", "DATA_APP"."NAME", ... FROM "DATA_APP"
  WHERE ("NAME" = ?) AND ("ENABLED" = TRUE) [42102-214]
```

Root cause — the documented **"snapshots go stale after schema migrations"**
gotcha (PORTING.md):

- The `data_app` table is created by `resources/migrations/064/20260717_data_app.yaml`
  (`tableName: data_app`). The jar (merge commit) includes it, so a **fresh**
  boot has the table.
- `e2e/snapshots/default.sql` on this box is dated **07-17 20:59** and contains
  **zero** `DATA_APP` references (`grep -c DATA_APP` → 0). It predates the
  migration.
- `restore("default")` RUNSCRIPTs that stale dump over the migrated schema,
  **dropping** the `data_app` table the boot migrations had created. Every
  subsequent data-apps request 500s.

This bites uniformly: the FE host route `/apps/:slug` renders no iframe (the
metadata fetch 500s before `mockDataApp`'s `page.route` matters for the *shell*
— the shell itself is served by the failing BE embed route), so
`iframe[title="Kitchen Sink"]` never appears, and the direct
`GET /embed/apps/:slug` CSP-header probe returns an error page with no CSP.

## Why I did NOT regenerate the snapshot

The sanctioned remedy is `node e2e/runner/run_cypress_ci.js snapshot …`, but
PORTING.md is explicit: **"Do not regenerate snapshots while other slots are
live — all five share those files, and regenerating means running Cypress."**
At the time of the run the box was **not** quiet:

- Live slot backends on ports **4100, 4101, 4103, 4104, 4105, 4106** (6 siblings).
- A **Cypress Chrome** run in progress (`…/Cypress/…/run-23752`).

Regenerating the shared, gitignored `e2e/snapshots/*` would corrupt those 6
backends' `restore()` mid-flight and collide with the running Cypress. The
cost/risk asymmetry is one-sided, so I stopped rather than regenerate.

**CI is unaffected**: CI generates snapshots fresh at run time against the
migrated schema (the `data_app` table will exist there), so both ports should
verify green on CI and on any quiet box after a `default` snapshot regen.

## State of the deliverable

- `support/data-apps.ts`, `tests/data-apps-sandbox.spec.ts`,
  `tests/data-apps-viewing.spec.ts` — written, faithful, **tsc --noEmit clean**.
- The fixture bundle **does build**: `node e2e/support/helpers/build-data-app-fixture.mjs
  kitchen-sink` produces `dist/index.js` (8.5 KB). It needed `vite` (a new
  devDependency, `"vite": "^8.0.16"`) which was **not installed locally** — a
  plain `bun install` materialised it (CI runs the same). `mockDataApp` runs
  that build and caches it per process.
- **NOT added to PORTED.txt** (not green — cannot honestly claim it).
- **No mutation testing** (can't reach a green baseline to mutate from).
- **No Cypress cross-check** (sibling slots live; and it would fail identically
  for the same snapshot reason, proving nothing about fidelity).

## To finish this port (handoff)

On a **quiet** box (no other slots live, no Cypress running):

1. Regenerate the `default` snapshot so it carries the `data_app` table:
   `node e2e/runner/run_cypress_ci.js snapshot --expose grepTags="-@external"`
   (verify `grep -c DATA_APP e2e/snapshots/default.sql` > 0 afterwards).
2. Kill slot 2 (`lsof -ti :4102 | xargs kill -9`), `rm -rf $TMPDIR/mb-pw-slot-2`,
   and run the standard jar loop for each spec; expect 6 + 8 tests green.
3. Then: `--repeat-each=2`, mutation-check one meaningful assertion per spec,
   append both source paths to PORTED.txt.

## Port-fidelity notes (for the eventual green run)

- `H.activateToken("bleeding-edge")` → `mb.api.activateToken("bleeding-edge")`;
  describes gated `test.skip(!resolveToken("bleeding-edge"), …)` (rule 7). No
  `@external`/QA-DB content — the queries hit the sample DB (ORDERS_ID=5), so no
  `PW_QA_DB_ENABLED` gate.
- `H.mockDataApp` → `page.route` on `/api/apps/*` (repo-status / list / metadata
  / bundle), registered **before** the `openDataApp` navigation that triggers
  the fetches. Non-matching `/api/apps/*` (the SDK's real query calls) fall
  through to the backend, mirroring the Cypress intercepts which only stub those
  four paths.
- `cy.intercept("GET", ALLOWED_URL, {…CORS…})` → `page.route(ALLOWED_URL, …)`
  fulfilling with `access-control-allow-origin: *`. The sandbox's allowed-host
  fetch is a real network call, caught at the browser network layer regardless
  of which frame issues it.
- `cy.signIn("nodata")` → `mb.signIn("nodata")`. The harness `signIn` already
  uses the throwaway-context POST for users without a cached snapshot session
  (fixtures.ts:90), so no session cookie leaks into `mb.api`'s jar — the
  session-cookie hazard the brief flagged is already handled; no bespoke
  `signInWithCredentials` needed.
- `findByRole(role, {name: str})` → `getByRole(..., { exact: true })` (rule 1).
  `cy.location("pathname").should("eq", …)` → `expect.poll(() => new
  URL(page.url()).pathname)` (retried URL assertion).
- `should("not.exist")` on the loader → `toHaveCount(0)`; `have.css` →
  `toHaveCSS`; `cy.window().should("not.have.property", X)` →
  `page.evaluate(() => X in window)` expect false.
