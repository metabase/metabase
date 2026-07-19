# boxplot.cy.spec.js → tests/boxplot.spec.ts

9 tests, all green on the jar (slot 3), 18/18 under `--repeat-each=2`. No
fixmes, no product-bug claims, so no Cypress cross-check was needed.

## Size / fixes

- 9 tests (7 top-level + 2 in a `multi-series` describe).
- New helpers → `support/boxplot.ts` only: `getBoxes` / `getPoints` /
  `getMeanMarkers` (port of `H.BoxPlot`), plus the Cypress chart-position
  action shims `triggerMousemoveLeft`, `clickLeft`, `hoverChartTop`.
- Everything else imported read-only (charts, viz-charts-repros
  assertEChartsTooltip/visitAdhoc, line-chart openSeriesSettings/echartsExactText/
  triggerMousemove, filters-repros findByDisplayValue, factories, ui, text,
  visualizer-basics goalLine, question-new tableInteractiveBody).

## Fixes classified (all known gotchas)

- **`.trigger("mousemove", "left")` = synthetic dispatch at the LEFT edge, not a
  real hover.** Same wave-13 gotcha as line-chart (`.trigger` is synthetic;
  ECharts hit-tests the tooltip from the event coordinate). The boxplot tests
  hover/click the left of each box specifically to dodge the diamond mean marker
  overlaying its center. Ported the bare outlier `.trigger("mousemove")` to the
  shared center `triggerMousemove`.

- **`.click("left")` real click needs an inward inset, not x≈0.** The only
  non-mechanical fix. Cypress's `"left"` position is the left-center of the
  element's bounding box; the box `<path>`'s bounding box spans the whiskers, so
  its extreme-left edge is a 1px stroke line that Playwright hit-tests to bare
  `<svg>` ("svg intercepts pointer events", 60 retries). Clicking a fifth of the
  way in (`x = width * 0.2`, still left of the center marker, squarely inside the
  translucent `fill-opacity="0.15"` fill) lands on the path and drills. This is
  the box-path analogue of the wave-9 "stale chart-click coordinates" note.

- **ECharts SVG `<text>` whitespace** (wave-11 gotcha): all chart-text existence
  checks (`"412"`, `"$52.13"`, `"600"`, `"Count Label"`, `"Target"`, …) go
  through `echartsExactText` (whitespace-tolerant `^\s*…\s*$` regex), never
  `getByText` exact.

- **`findAllByTestId("legend-item").should("contain", str)` is ANY-of-set**
  (rule 3): ported as `filter({ hasText }).not.toHaveCount(0)` per category /
  metric, not an exact match.

- `should("exist")` → `toBeAttached`; `should("not.exist")` → `toHaveCount(0)`;
  `should("be.visible")` → `toBeVisible`. `H.tableInteractiveBody().contains(str)`
  → scoped `getByText(caseSensitiveSubstring(str)).first()`.

## Dividends

None — clean, faithful port. No Cypress-masked issues surfaced.
