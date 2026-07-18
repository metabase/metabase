# title-drill.cy.spec.js → title-drill.spec.ts

Source: `e2e/test/scenarios/dashboard/title-drill.cy.spec.js` (656 lines, no gating tags)
Target: `tests/title-drill.spec.ts` + new helper `support/title-drill.ts`

## Result

All 9 tests ported faithfully. Green on the CI uberjar (`target/uberjar/metabase.jar`,
COMMIT-ID 751c2a98), slot 5: 9/9 first try, 18/18 under `--repeat-each=2`. tsc clean
(the one project-wide tsc error is in a sibling agent's untracked `pie-chart.spec.ts`,
not this port). No `test.fixme`, no product-bug claims — so no Cypress cross-check
required.

## Fixes / decisions classified

All mechanical, per known gotchas — nothing new:

- **Reusable `cy.intercept(...).as("cardQuery")` waited on repeatedly (rule 2 +
  "check what actually fires the request").** The describe-3 nodata test title-drills
  off the dashboard, then reruns the query from the *query builder* — which fires
  `/api/dataset`, NOT the dashboard's `/api/dashboard/:id/dashcard/:id/card/:id/query`.
  A literal port of the dashboard-scoped alias would hang on every post-drill wait.
  New helper `waitForTitleDrillQuery` matches either endpoint (plus saved
  `/api/card/:id/query`), registered before each trigger. The spec's *first*
  `cy.wait("@cardQuery")` (initial dashboard load) is already covered by
  `visitDashboard`'s own dashcard-query wait, so it's dropped (noted inline).
- **Rule 1 (exact string matchers):** `findByRole("link", {name})`, `findByText`,
  `cy.button(...)`, `findByPlaceholderText` all ported with `{ exact: true }` /
  `getByRole("button", {name, exact:true})`.
- **`cy.contains(value)` (case-sensitive substring):** `checkFilterLabelAndValue`'s
  value check ported as `getByText(value).first()` (first-match), and
  `H.filterWidget().contains("Doohickey")` as `.filter({ hasText })`.first().
- **`findByLabelText(label,{exact:false}).should("exist")`:** the accessible name is
  duplicated on the parameter-widget wrapper + inner control (known native-widget
  gotcha), so `.first()` + `toBeAttached()` (mirrors "exist", not "be.visible").
- **`realHover`/`trigger("mouseover")`/`.focus()` → `hover()`/`focus()`.** Chart
  titles are `href="#"` until focus/hover makes them real anchors — asserted before
  and after, as upstream does.
- **Hash/URL assertions retried by Cypress → `expect.poll`** over `page.url()` /
  `new URL(page.url()).pathname` (title-drill navigations are client-side; MB_SITE_URL
  is pinned so they stay on-slot — no origin drift observed).
- **`fieldValuesCombobox().type("5")` → `pressSequentially`** (search/typeahead box).
- **`cartesianChartCircle().eq(20)` → `cartesianChartCircles(page).nth(20)`.**

## New helper file: support/title-drill.ts

- `checkScalarResult`, `checkFilterLabelAndValue` — spec-local assertions.
- `createDashboardWithQuestions` — port of `H.createDashboardWithQuestions` with the
  `dashboardName` + per-card `cards` layout options the filters-repros version lacks
  (the "various charts" test lays out four cards explicitly). Reuses
  filters-repros `createDashboard`/`createQuestion`/`createNativeQuestion`.
- `waitForTitleDrillQuery` — the either-endpoint wait described above.

Everything else reused: `createNativeQuestionAndDashboard`, `createQuestionAndDashboard`,
`createQuestion`, `createDashboard`, `editDashboardCard`, `dashboardParametersPopover`,
`visitDashboardWithParams` (filters-repros); `addOrUpdateDashboardCard` (drillthroughs);
`visitDashboard`, `appBar`, `popover` (ui); `getDashboardCard`, `filterWidget`
(dashboard); `queryBuilderMain` (notebook); `queryBuilderFiltersPanel` (detail-view);
`cartesianChartCircles` (metrics); `fieldValuesCombobox` (native-filters).

## Dividend flag

None. No bug found, no Cypress-masked issue, no assertion strengthened beyond the
original. Clean, faithful port.

## Not verified

- Only exercised on the jar at slot 5, Playwright's bundled Chromium. No `--browser
  chrome` cross-check was run (not required — no fixme/bug claim).
