# line-bar-tooltips.cy.spec.js → tests/line-bar-tooltips.spec.ts

Ported all 22 tests. Result on the jar (slot 3, COMMIT-ID 751c2a98,
TZ=US/Pacific): **20 passed, 1 skipped, 12/12 stable** under `--repeat-each=2`
(counts as 42 passed / 2 skipped over 2 repeats). tsc clean.

New helpers: `support/line-bar-tooltips.ts` only (setup, showTooltipFor*,
testTooltipExcludesText, updateColumnTitle, the test*Change assertions).
Everything else imported read-only from shared modules.

## Fidelity gotcha (worth a PORTING note): `H.tooltipHeader(x)` takes NO args

`e2e-visual-tests-helpers.js:184` — `tooltipHeader()` takes no parameters and
asserts nothing; it just returns the `echarts-tooltip-header` locator. So the
spec's `H.echartsTooltip().within(() => { H.tooltipHeader("2025"); ... })` in
the `test*Change` helpers is a **no-op header call**. Porting those `"2025"`
strings as real `assertEChartsTooltip({ header })` assertions would *strengthen*
the test and fail — e.g. `testAvgTotalChange`'s index-1 tooltip is really "2026"
while upstream "asserts" 2025 (a no-op). The `test*Change` helpers therefore
assert **rows only**. The direct `H.assertEChartsTooltip({ header })` calls in
the describe bodies DO assert the header (via `tooltipHeader().should("have.text",
...)`) and are ported with the header intact.

This is a known-gotcha class (rule: read the helper body before porting its call
shape) but a fresh instance — a helper whose argument is silently ignored. If it
recurs, tighten the brief.

## Porting fix (not a bug): enterable long tooltip must be entered before scroll

The "should be enterable and scrollable ... long tooltips" test (metabase#53586 /
#48347) failed on the first pass with `Element is not attached to the DOM` during
`scrollIntoViewIfNeeded`. Root cause: while the mouse is over the *bar*, ECharts
keeps re-rendering the hovered tooltip, so any located row detaches mid-scroll.
The feature under test is that the tooltip is **enterable** — moving the mouse
into it freezes the re-render, after which it scrolls. Fix: after hovering the
bar, `page.mouse.move()` into the tooltip's bounding box, THEN scroll the bottom
row into view. Also needed `await expect(tooltip).toBeVisible()` before
`boundingBox()` — `boundingBox()` does NOT auto-wait for visibility and returns
`null` on the post-hover race. Faithful behaviourally (Cypress's jQuery
`.scrollIntoView()` never had the re-render race because it doesn't move a real
cursor).

## Faithfully skipped

The `{ tags: "@skip" }` test in "> multi series question on dashboard with added
question" (VIZ-671: converting a multi-series line chart swaps series colors) is
ported as `test.skip` with the full body preserved.

## Mapping notes

- `.trigger("mousemove")` on circles → `triggerMousemove` (synthetic dispatch);
  `.realHover()` on bars → `.hover()` (wave-13 rule). Wrapped in
  showTooltipForCircleInSeries / showTooltipForBarInSeries.
- `testTooltipExcludesText`'s `cy.contains(text)` → case-sensitive substring
  regex `getByText` (not exact).
- `should("be.hidden")` on `findAllByTestId("echarts-tooltip")` → no visible
  tooltip remains: `getByTestId("echarts-tooltip").filter({visible:true})`
  `.toHaveCount(0)`.
- Bounding-box overlap check ("not fully cover small dashcards") ported directly
  from getBoundingClientRect to `boundingBox()`.

## Consolidation candidate

`updateColumnTitle` uses `filters-repros.findByDisplayValue` scoped to
`chartsettings-list-container` — same pattern several viz specs re-implement.
The `test*Change` / `showTooltipFor*` tooltip helpers overlap conceptually with
combo/line-chart specs; a shared cartesian-tooltip helper module could absorb
them alongside the flagged `charts.ts` tooltip consolidation.
