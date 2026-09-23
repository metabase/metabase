# legend.cy.spec.js → tests/legend.spec.ts

Ported all 3 tests faithfully (issue numbers: none carried in the original).
Green on the jar (slot 2), 3/3 first pass and 6/6 under `--repeat-each=2`. No
`test.fixme`, no product-bug claims — so no Cypress cross-check was required.

## Fixes classified

All mechanical port work; no app bugs.

- **Scoped chart-locator helpers (known gotcha — Playwright locators are
  absolute).** The dashboard test asserts on a chart *inside a specific
  dashcard* via Cypress `H.getDashboardCard(n).within(...)`. The shared
  `chartPathWithFillColor` (binning.ts), `pieSlices` (dashboard-card-repros.ts)
  and `trendLine` (charts.ts) all anchor at page level, which matches across all
  5 dashcards. Added scope-taking forms in the new `support/legend.ts` rather
  than editing shared files. Consolidation candidate: these three shared helpers
  could all grow an optional `scope` param.
- **`scatterBubbleWithColor` had no PW port** — ported `H.scatterBubbleWithColor`
  (e2e-visual-tests-helpers.js) into support/legend.ts. Consolidation candidate:
  belongs in a charts module next to the other `*WithColor` helpers.
- **axis-text-spaces gotcha (known).** The many `cy.findByText("1,800" | "Count"
  | "Created At: Year" | "600,000" | "54" ...)` lookups run inside
  `H.echartsContainer().within(...)` against ECharts SVG `<text>`, which carries
  leading/trailing whitespace that Playwright `getByText` does not trim. Used a
  whitespace-tolerant exact regex helper (`echartsText`, `^\s*…\s*$`) so the
  matches stay exact ("1,500" never matches a longer number) while surviving the
  padding. `should("exist")` → `toBeVisible()` on `.first()`; `should("not.exist")`
  → `toHaveCount(0)` on the un-first'd locator.
- The pie *center* total values ("18,760", "17,418", "1,660") are card-scoped
  regular DOM text, not axis text — ported as exact `getByText`, not `echartsText`.
- **findByLabelText → exact getByLabel** ("Hide series" / "Show series"), port
  rule 1.
- **realHover → hover** on bar chart paths; the tooltip assertions
  (`assertEChartsTooltip`, imported read-only from viz-charts-repros.ts) resolved
  cleanly with plain `.hover()` — no force needed for the bar/scatter paths here.
- `getPieChartLegendItemPercentage` (`.eq(0).children().eq(1)`) →
  `.first().locator(":scope > *").nth(1)`; hidden-slice `""` percentage asserted
  with `toHaveText("")`.
- `cy.realPress("Escape")` → `page.keyboard.press("Escape")`;
  `H.showDashcardVisualizerModal(0, { isVisualizerCard: false })` reused from
  visualizer-basics.ts.

## Dividends

None — faithful port, no Cypress-masked issues surfaced.
