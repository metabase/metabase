# line_chart.cy.spec.js → tests/line-chart.spec.ts

Source: `e2e/test/scenarios/visualizations-charts/line_chart.cy.spec.js` (847 lines)
25 tests, all faithfully ported. Verified on the jar (slot 2, `JAR_PATH` +
`PW_PER_WORKER_BACKEND`): 50/50 green under `--repeat-each=2`, tsc clean.

New helper module: `support/line-chart.ts` (openSeriesSettings, getXYTransform,
echartsExactText, chartSettingSelectValues, expectFieldPickerHasGrabber,
brushChart, triggerMousemove, widened visitLineChartAdhoc/visitNativeLineChartAdhoc).
Snowplow helpers → no-op stubs (port rule 6). Consolidation candidates flagged
inline in the module header.

## New gotcha (reusable) — `.trigger("mousemove")` on chart elements must be a synthetic dispatch, not real hover

The tracking test does `H.cartesianChartCircle().first().trigger("mousemove")`
then asserts the tooltip shows the FIRST data point's values (Sum of Total
`$52.76`, Average of Quantity `2`). Ported as a real `.hover({ force: true })`
on the first visible circle, **no tooltip appeared at all** — the assertion
timed out with an empty tooltip. Probing every visible circle showed real hover
triggers a tooltip on interior points but *not* the first one, which sits on the
y-axis at the left plot edge (x≈117): ECharts (zrender) hit-tests the tooltip
from the mouse coordinate, and a real-mouse hover on that edge point resolves to
nothing. A synthetic `MouseEvent("mousemove")` dispatched on the element at its
center — which is exactly what Cypress's `.trigger("mousemove")` does — fires the
tooltip reliably and yielded precisely `April 2025 | Sum of Total $52.76 |
Average of Quantity 2`.

Fix: `triggerMousemove(locator)` in support/line-chart.ts. The faithful mapping
is **`.trigger("mousemove")` → synthetic dispatch, `.realHover()` → real hover**.
`.realHover()` sites (test 15998, interior point `.eq(3)`) port fine as
`hover({ force: true })`; only the synthetic `.trigger("mousemove")` sites (the
two goal-line tooltips and the split-panel tooltip) need the dispatch. Symptom
is misleading: the row name locator ("Sum of Total") half-matches nothing and
the failure reads as "wrong value" when the real cause is "no tooltip at all".

## Cypress-masked weak assertion — `g.axis.yr` not.exist is vacuous post-ECharts

Two y-axis-splitting tests assert `cy.get("g.axis.yr").should("not.exist")` to
prove the chart is NOT split. `g.axis.yr` is the pre-ECharts d3 selector; the
current ECharts renderer never emits it, so the negative assertion passes
vacuously in both Cypress and the port — it proves nothing about splitting.
Ported faithfully (`expect(page.locator("g.axis.yr")).toHaveCount(0)`) so the
port matches upstream, but the assertion is dead. The sibling positive tests in
the same describe (findByText "Average of Latitude"/"Sum of Total" etc.) carry
the real coverage. Candidate for an upstream strengthening (assert a single
y-axis name, or that the second axis label is absent).

## Known gotcha applied (no action) — ECharts axis-text whitespace

ECharts SVG `<text>` carries surrounding whitespace and Playwright getByText does
not trim, so exact tick/label matches ("0", "8", "100%", "$50.0k", "$60,000",
"50.0k%", "prefix0") go through `echartsExactText` (a `^\s*…\s*$` regex). Loose
`cy.get("text").contains(...)` checks (axis names "Created At", "Average of
Price", "39.75%") stay substring getByText. Critical for "0"/"8" where a bare
substring would match "10"/"60,000".
