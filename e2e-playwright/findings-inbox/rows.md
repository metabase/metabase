# rows.cy.spec.js → tests/rows.spec.ts

Row chart (visx, not ECharts): 6 tests. 4 executable + 2 Firefox-only repros.

## Result

- 4/4 executable tests green on the jar (slot 1, COMMIT-ID 751c2a98),
  stable under `--repeat-each=2` (8/8). tsc clean.
- 2 metabase#14285 repros are `{ browser: "firefox" }` in Cypress (skipped in
  the Chrome CI leg) → ported as `test.skip` (Firefox-specific per the upstream
  comment). Not runtime-verified — same status as upstream CI.

## No dividends / no bugs

No test.fixme, no product-bug claims — nothing needed a cross-check. Faithful
mechanical port.

## Fixes classified (all "known gotcha", none new)

- `H.main()` = `cy.get("main")` → `page.locator("main")` (inlined; `main` is
  not consolidated — 3 spec-helper copies already exist per INDEX. Left inline
  rather than add a 4th).
- `cy.findByText(number)` (testing-library exact) → `getByText(String(n),
  {exact:true})` (rule 1).
- `.invoke("width")` (jQuery, on a `<rect>` / SVG `<g>`) → `boundingBox().width`
  (`boxWidth` in support/rows.ts). The metabase#43631 "hover doesn't resize the
  bar" check compares boxWidth before/after `hover()`.
- `{ visitQuestion: true }` on the create* helpers → `createNativeQuestion` /
  `createQuestion` then `visitQuestion(page, id)`.

## New helpers (support/rows.ts)

Row chart is visx: bars = `[role="graphics-symbol"]`, `.visx-columns` (plotted
bars group), `.visx-axis-left` (category axis). `queryVisualizationRoot`,
`rowChartBars`, `visxColumns`, `visxAxisLeft`, `boxWidth`. Consolidation note:
fold into charts.ts if more visx/row-chart specs land (charts.ts is currently
all ECharts).
