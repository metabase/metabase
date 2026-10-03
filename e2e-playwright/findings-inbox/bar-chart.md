# bar_chart.cy.spec.js → tests/bar-chart.spec.ts

Source: `e2e/test/scenarios/visualizations-charts/bar_chart.cy.spec.js`
Verified on the CI EE uberjar (COMMIT-ID 751c2a98), slot 4.
21 tests: 20 pass, 1 faithful `test.skip` (upstream `{ tags: "@skip" }`).
Green under `--repeat-each=2` (40/40 executable, 2 skipped). tsc clean
(only sibling agents' in-progress files error in the shared worktree).

## New helpers (support/bar-chart.ts only)
- `getValueLabels(scope)` — H.getValueLabels (`text[stroke-width='3']`), scoped
  so the #33725 dashcard `within` maps to a Locator.
- `otherSeriesChartPaths(scope)` — H.otherSeriesChartPaths (`#949AAB`); only the
  @skip body needs it, but it must type-check.
- `expectChartPathVisible(scope, color)` — the `chartPathWithFillColor(color)
  .should("be.visible")` any-of assertion (rule 3), `.filter({visible:true}).first()`.

Everything else imported read-only: chartPathWithFillColor/echartsText (legend),
echartsContainer/leftSidebar/openVizSettingsSidebar/tooltip (charts),
getDraggableElements (charts-extras), visitAdhoc/visitNativeAdhoc/
assertEChartsTooltip/echartsTooltip/echartsTriggerBlur/moveDnDKitElementVertically
(viz-charts-repros), createQuestion/createNativeQuestion/createDashboardWithQuestions
(factories), createQuestionAndAddToDashboard (dashboard-card-repros),
triggerMousemove (line-chart), findByDisplayValue (filters-repros),
selectFilterOperator (joins).

## Fixes classified (all known gotchas — no new ones)
- **Native adhoc → visitNativeAdhoc.** Every `H.visitQuestionAdhoc` on a native
  query maps to `visitNativeAdhoc` (visitAdhoc's native branch throws — native
  isn't autorun from the hash). Numeric-dimension, very-low/high, native
  split-axis, and #68048 all use it.
- **ECharts axis-text whitespace (rule / wave-11 gotcha).** `(empty)`, `1,800`,
  `16,000`, `3.0k`, series-name and axis-label lookups use legend's `echartsText`
  (whitespace-tolerant exact regex) since Playwright getByText doesn't trim.
- **`.should("be.visible")` on a color's bar set = any-of (rule 3)** →
  expectChartPathVisible.
- **`.type("{backspace}2")` caret at end (wave-12).** `press("End")` before
  Backspace so `101` → `102` (not `2101`). This is the crux of #28796 (101 rows
  → the >100-series error state).
- **`.get("text")` after echartsContainer is really unscoped `cy.get`** — ported
  as `echartsContainer(page).locator("text")` filtered (the values are all in the
  chart), preserving the any-of `.should("contain", …)`.
- **`cy.contains(selector, text)` is case-sensitive substring, first-match** —
  dashcard-by-title (`getByTestId("dashcard").filter({hasText:/…/})`) and the
  rotated-label filter use case-sensitive regex, not exact.
- **Response-modifying intercept** (`req.continue(res => …development_mode)`) →
  `page.route` + `route.fetch()` + `route.fulfill({response, json})`. Not a
  redirect, so the redirect gotcha doesn't apply.
- **`H.createQuestion(x, {visitQuestion:true})` / `{wrapId:true}`** — the port's
  factory has no options arg: `createQuestion(api, …)` then `visitQuestion`, and
  the id is just the returned card. The `type: "query"` field in these fixtures
  is the *dataset_query* type (not card type) and is harmlessly ignored.
- **`H.cypressWaitAll([createQuestionAndAddToDashboard, …])`** ported as
  sequential awaits — both re-read the dashboard and PUT, so concurrency would
  clobber; Cypress's command queue serialized them anyway.
- **Dropped redundant `cy.wait("@dataset")`** in #60475 / #68048 (the visit
  helper already awaits it; Playwright waitForResponse can't consume a past one).

## Dividends
None. No product bugs surfaced; no Cypress-masked issues. All behavior matched
the jar first try — no test.fixme, so no fidelity cross-check was required.

## Not verified
The `@skip` test ("Other" series grouping) is ported faithfully but never
executes (upstream skips it); its body compiles but is runtime-unverified.
The `#43536` bar-height ratio and `#68048` label-rotation assertions are
geometry/layout based; they passed on bundled Chromium here, but if a future CI
Chromium bump shifts text metrics they are the engine-sensitive candidates.
