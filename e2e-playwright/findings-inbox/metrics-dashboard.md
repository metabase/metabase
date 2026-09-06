# metrics-dashboard.cy.spec.js → tests/metrics-dashboard.spec.ts

7 tests, all ported faithfully. Green on the jar (slot 3, COMMIT-ID 751c2a98):
7/7 first pass, 14/14 under `--repeat-each=2`. tsc clean. No test.fixme, no
product-bug claims — so no Cypress cross-check was required.

## New helper
- `support/metrics-dashboard.ts` — only `chartLegendItem(scope, name)` was
  genuinely new (H.chartLegendItem = chartLegend().findByText(name), which the
  shared `visualizer-cartesian.ts` only had as the *plural* `chartLegendItems`).
  Builds on the exported `chartLegend`. Everything else imported read-only
  (createDashboardWithQuestions, visualizer surface, dashboard editing,
  MetricPage/visitMetric/cartesianChartCircles, undoToastList, etc.).

## Fixes / classification (all known gotchas — nothing new)
- Dropped the never-awaited `@cardQuery` intercept (rule 2); noted in header.
- `@search` and `@dataset` waits registered BEFORE their trigger (rule 2). The
  search box gets `pressSequentially` (typeahead debounce, rule 5), not fill().
- `H.showDashcardVisualizerModal(0, {isVisualizerCard:false})` reused for BOTH
  the combine-scalar and combine-timeseries opens — test 1's Cypress opened the
  modal manually (realHover + "Visualize another way") but the shared helper
  does exactly that plus a modal-open assertion, so it's a faithful strengthen.
- `cy.location("pathname").should("eq", …)` → `expect.poll` (retried hash rule).
- `findAllByText(...).should("have.length", 2)` → `toHaveCount(2)`;
  `should("exist")` → `.first()` + `toBeAttached()`.
- Replace-with-metric second step: added an explicit `waitFor()` on the metric
  name in the entity picker before clicking "Orders" (list re-render safety;
  the picker re-populates — mirrors the "list re-renders under a resolved
  locator" precedent). Not strictly required but keeps it deterministic.

## No dividends
Nothing Cypress-masked; no strengthened assertions beyond the two mechanical
count conversions above. Straightforward port.
