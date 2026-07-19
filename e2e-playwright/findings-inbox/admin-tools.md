# admin-tools (admin/tools/tools.cy.spec.ts)

19 tests, all passing on the jar (slot 2), 38/38 under `--repeat-each=2`, tsc clean.
Token-gated EE describes (erroring questions, model-persistence) run because the
jar activates the pro-self-hosted token. No product bugs; no `test.fixme`.

## Fixes made while stabilizing (all port-timing, none app bugs)

- **issue 57113 (about:blank history-wipe).** The Cypress spec set
  `window.location.href = "about:blank"` inside `cy.window().then(...)` then
  `cy.visit(pathname)`. Ported literally as a single `page.evaluate` that sets
  `location.href`, the in-flight about:blank navigation raced the following
  `page.goto(taskPath)` ("Navigation ... interrupted by another navigation to
  about:blank"). Fix: do the history `replaceState` in evaluate, then hop to
  about:blank via `page.goto("about:blank")` (which waits), then goto the task.

- **task-runs filtering: entities `waitForResponse` registered too late.** The
  `/api/task/runs/entities` request fires the moment started-at is set (run-type
  already selected). Cypress `cy.wait("@getEntities")` matches retroactively;
  Playwright's `waitForResponse` must be registered BEFORE the trigger. Moved
  the entities wait ahead of `selectStartedAt`. (Standard PORTING rule 2.)

## Known-gotcha applications (no new ground)

- **Cypress glob `?` semantics on the pagination stubs.** The list intercepts
  (`/api/task?limit=50&offset=0&sort_column=...`) are glob strings whose `?`
  matches the literal `?` and whose remainder is exact (no `*`), so they match
  ONLY the fully-unfiltered request — the filtered requests fall through to the
  real backend. Reproduced with URL predicates that require the exact
  limit/offset/sort params AND the absence of every filter param. Getting this
  wrong would have made the "filtering" tests either over-stub or mis-match.

- **Copy button: real clipboard instead of a spy.** Upstream stubbed
  `navigator.clipboard.writeText` and asserted `calledWith`. Ported by granting
  clipboard permissions and reading the real clipboard back — equivalent and
  needs no spy.

- **Downloads** (task JSON, logs txt): `page.waitForEvent("download")` +
  `fs.readFileSync`, matching `downloadDiagnosticInfo`'s pattern.

- **Log-download timestamp formatting** uses `dayjs(ts).format()` to match the
  FE's `formatTs` (Logs/utils.ts) exactly — the same trick the original's
  `formatTimestamp` used to stay timezone-agnostic. dayjs is present in the
  hoisted node_modules and ships its own types (tsc clean).

## Environment note (not a bug, worth flagging)

- **`filtering should work` depends on REAL sample-DB sync data.** Because the
  filtered `/api/task` request bypasses the stub, that test asserts exactly one
  `field values scanning` success task exists for Sample Database after restore.
  It's green on the jar (post-sync), but it is data-dependent by construction —
  faithful to upstream, which has the same implicit dependency.
