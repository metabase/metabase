# visualizer-cartesian (dashboard/visualizer/cartesian.cy.spec.ts)

Ported 10 tests → tests/visualizer-cartesian.spec.ts. 10/10 green on the jar
(slot 5, COMMIT-ID 751c2a98), 20/20 under --repeat-each=2. tsc clean. No
test.fixme, no product-bug claims — no cross-check required.

## Fixes classified (all Known gotcha — brief already covered them)

- Reused the visualizer surface from visualizer-basics.ts wholesale (fixtures,
  clickVisualizeAnotherWay, selectDataset, wells, assertWellItems*,
  showDashcardVisualizerModal, saveDashcardVisualizerModal,
  assertDataSourceColumnSelected, deselectColumnFromColumnsList, goalLine). New
  helpers went to support/visualizer-cartesian.ts only.
- ECharts axis <text> whitespace (PORTING wave-11 gotcha): x/y-axis label
  assertions ("January 2026", "600", "10", "6,000", "Doohickey", …) use a
  whitespace-tolerant regex (echartsTextExact), not exact getByText.
- Zero-extent / marker paths (rule 3, chartGridLines precedent): goalLine and
  chartPathWithFillColor existence checks use toBeAttached, not toBeVisible.
- Scoped chart helpers: the spec calls the bare Cypress chart helpers inside
  `H.modal().within()` and `H.getDashboardCard(n).within()`. The edit-mode
  dashboard behind the modal has its own chart-containers, so
  chartPathWithFillColor / trendLine / echartsTextExact / echartsContainer take
  a scope (modal(page) or the dashcard) rather than page-global getByTestId.
- EditableText series-name-input: renamed with the click+select-all+type+blur
  dance (renameEditableText from visualizer-basics), mirroring `.type(
  "{selectall}{del}Series B").blur()`.
- findByDisplayValue → modal-scoped `input[value=...]` toBeChecked
  (ensureDisplayIsSelected + the inline "bar" check), the visualizer-basics
  precedent.

## Migration dividend (flag)

- **Consolidation: the visualizer helper surface is now split across THREE
  files** — visualizer-basics.ts, dashboard-card-repros.ts
  (showDashcardVisualizerModal / saveDashcardVisualizerModal overlap), and now
  visualizer-cartesian.ts. This port had to re-implement the private `dataSource`
  / `dataSourceColumn` from visualizer-basics purely because they aren't
  exported, and add chartLegend / chartLegendItems / selectColumnFromColumnsList
  / removeDataSource / ensureDisplayIsSelected / showDashcardVisualizerModalSettings.
  A single shared `support/visualizer.ts` exporting the full
  e2e-dashboard-visualizer-helpers.ts surface (with scope-parameterised chart
  helpers) would let both specs — and future visualizer ports (pie/funnel/etc.)
  — import instead of re-implementing. High-value dedup, same shape as the
  notebook.ts startNewQuestion flag.
