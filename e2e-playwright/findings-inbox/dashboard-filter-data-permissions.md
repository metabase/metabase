# dashboard-filter-data-permissions

Source: `dashboard-filters/dashboard-filter-data-permissions.cy.spec.js`
Port: `tests/dashboard-filter-data-permissions.spec.ts` (+ new helper
`support/dashboard-filter-data-permissions.ts`)

metabase#8472: a dashboard text filter mapped to a data column must offer its
value suggestions to any user who can view the dashboard — including a nodata
user. 2 tests (admin + nodata). Both green on the jar (slot 1), 4/4 under
`--repeat-each=2`, tsc clean.

## Fixes / classifications

- **Dead-branch fidelity (not a bug).** The spec-local `filterDashboard` has a
  `suggests: false` branch, but both tests call it with the default
  `suggests: true`, so that branch never runs. Ported for fidelity.
- **Broken Cypress intercept — dropped (rule 2).** The original beforeEach
  intercept for the params search was never registered: a typo folded
  `.as("search")` into the URL string
  (`` `/api/dashboard/${ID}/params/*/search/*").as("search` ``), so the alias
  "search" never existed. It was only consumed by the dead `suggests: false`
  branch's `cy.wait("@search")`. The helper's 403 branch now registers a proper
  `waitForResponse` on the params-search pathname instead.
- **beforeEach settle hack replaced.** Cypress ended with
  `cy.contains("Save").click()` then `cy.contains("Orders in a dashboard").click()`
  (the title click was a settle). Replaced with `saveDashboard()`, which clicks
  Save, awaits the dashboard PUT, and waits for edit mode to exit + dashcards to
  reload.

## Dividends

None. No product bug surfaced; behaviour matched CI jar. (No cross-check needed —
no fixme/bug claim made; both tests pass on the jar.)
