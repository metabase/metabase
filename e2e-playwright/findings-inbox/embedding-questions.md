# embedding-questions

Port of `e2e/test/scenarios/embedding/embedding-questions.cy.spec.js` →
`tests/embedding-questions.spec.ts`. 9 tests, all green on the jar (slot 2),
18/18 under `--repeat-each=2`, tsc clean. New helpers isolated in
`support/embedding-questions.ts`; shared embedding infra imported read-only
(`support/embedding.ts`, `support/embedding-dashboard.ts`, `support/ui.ts`).

## Classified fixes (all known-gotcha; brief was sufficient)

- **Static-embed chart lives in the iframe.** The aggregation test's ECharts
  assertions (`echartsContainer`, `cartesianChartCircle`, `assertEChartsTooltip`,
  the `assertOnXYAxisLabels` axis-text check) all run against the embed
  FrameLocator returned by `visitIframe`. The shared chart ports
  (`charts.ts` / `viz-tabular-repros.ts`) are Page-scoped, so scope-aware
  (`Page | FrameLocator`) copies live in the new support file. This is the
  general "visitIframe → FrameLocator, everything downstream is frame-scoped"
  rule applied to charts rather than text.

- **Right-edge line point + iframe needs a re-nudge on the synthetic mousemove.**
  `H.cartesianChartCircle().last().trigger("mousemove")` maps to the wave-13
  synthetic `MouseEvent` dispatch (not real hover — the last point sits on the
  right plot edge where a real hover resolves to nothing). Ported literally it
  was flaky-to-dead inside the iframe: the single dispatch could land a beat
  before zrender was ready to open the tooltip, and nothing in the DOM
  distinguishes "dispatched but not shown yet". Fixed with the widget-state
  re-nudge pattern — wrap `triggerMousemove(lastVisibleCircle)` +
  `assertEChartsTooltip` in `expect(...).toPass()`. (Also `.filter({visible:true})`
  on the circles per rule 3, to skip any zero-extent path.) 12.2s vs ~2s for the
  siblings, but green every run.

- **Downloads-describe intercepts are never awaited.** `cy.intercept(...).as(
  "publishChanges" / "dl")` are registered in the `beforeEach` but the tests PUT
  via the API and never `cy.wait()` them — dropped per rule 2.

- **Timezone-sensitive rendered values.** Several assertions pin formatted dates
  ("Fri, Feb 11, 2028, 21:40:27", "February 11, 2028, 9:40 PM", the German
  "Februar 11, 2028, 9:40 PM", the joined "October 7, 2026, 1:34 AM"). Run with
  `TZ=US/Pacific` to match CI (Playwright inherits the process TZ; no
  `timezoneId` is set in the config). Noted in the spec header.

- **cy.scrollTo("right") with no duration** → assign `scrollLeft = scrollWidth`
  directly (the joined-table test scrolls the interactive table to reveal the
  User-join columns).

## Gating

EE describe + the "premium token" downloads context call `H.activateToken(
"pro-self-hosted")` and are `test.skip`-gated on `resolveToken("pro-self-hosted")`.
The first describe and the "without token" context work on the EE jar with no
premium token (restore() clears it), so they run unconditionally — this matches
upstream, where only the EE blocks activate a token.

## Not FINDINGS-worthy

No product bug, no Cypress-masked issue, no cross-check needed — every fix was a
mechanical harness translation covered by an existing gotcha. No dividends to
flag beyond the consolidation note below.

## Consolidation candidate (later pass)

`support/embedding-questions.ts` re-implements scope-aware `echartsContainer`,
`cartesianChartCircles`, `echartsTooltip`, `assertEChartsTooltip`, and
`triggerMousemove` purely to accept a `FrameLocator`. The Page-only versions in
`charts.ts` / `viz-tabular-repros.ts` / `metrics.ts` / `line-chart.ts` are the
same code with a narrower scope type — a scope-parameterised charts module would
absorb all of them (this is the second embedding spec to need frame-scoped chart
helpers).
