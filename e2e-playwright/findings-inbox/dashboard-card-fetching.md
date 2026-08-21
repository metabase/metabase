# dashboard-card-fetching.cy.spec.js → tests/dashboard-card-fetching.spec.ts

Source: `e2e/test/scenarios/dashboard-cards/dashboard-card-fetching.cy.spec.js` (59 lines).
New helper module: `support/dashboard-card-fetching.ts` (no shared files edited).

## Result

- 1 test ported (issue-number-free — none in the original). Faithful 1:1.
- **1/1 green on the jar (slot 3), 2/2 under `--repeat-each=2`.** No fixmes, no
  product-bug claims, so no Cypress cross-check was required.
- tsc clean for both new files.
- First-run green with zero iteration.

## What the test checks

The two dashcards fired on dashboard load must carry the *same*
`dashboard_load_id` (a 36-char uuid) in their `POST .../dashcard/.../query`
request bodies — that shared id is what lets the backend share the metadata
cache across a dashboard's queries. So this is a request-body assertion, not a
request-count one: the "how/when dashcard queries fire" framing in the brief is
generic; the actual single test only inspects the load-id of the two load-time
queries.

## Port decisions worth noting

- **`cy.wait(["@dashcardQuery","@dashcardQuery"])` + read each body →
  `collectDashcardQueryBodies(page, 2)`.** Registered BEFORE `visitDashboard`'s
  goto (rule 2). Deliberately a single `page.on("response")` collector rather
  than two `page.waitForResponse` promises: two identical `waitForResponse`
  predicates registered together both resolve on the *same* first matching
  response, which would read one body twice. The event collector gathers two
  DISTINCT responses, matching `cy.wait`'s sequential-alias semantics. Bodies
  read via `request().postDataJSON()`.
- **`visitDashboard` already awaits both dashcard-query responses**, so the
  collector runs alongside it; no extra settle needed.
- **Spec-local `createDashboardWithCards` collapsed** into the shared
  `createDashboard` (factories) + `updateDashboardCards` (dashboard-core) — the
  Cypress helper was just those two calls plus a `cy.wrap(id).as("dashboardId")`
  alias that has no Playwright equivalent (the id is a local variable).
- **Sample-question ids** (`ORDERS_COUNT_QUESTION_ID`,
  `ORDERS_BY_YEAR_QUESTION_ID`) resolved from `cypress_sample_instance_data.json`
  via the same `findQuestionId` pattern the other modules use, kept local to the
  new module rather than importing across shared modules.

## Dividends

None. Clean faithful port; behaviour matches the jar.
