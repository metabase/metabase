# chart-drill (visualizations-tabular/drillthroughs/chart_drill.cy.spec.js)

Ported 19 tests → `tests/chart-drill.spec.ts`. New helper file
`support/chart-drill.ts` (pieSliceWithColor, brushChart). Verified on the jar
(slot 1, COMMIT-ID 751c2a98): 19/19 green, 38/38 under `--repeat-each=2`, tsc
clean. No product bugs, no fixmes.

## Fixes classified (all known/mechanical gotchas — no new product findings)

- **`H.startNewQuestion` has two divergent ports; only one is faithful.**
  notebook.ts `startNewQuestion` clicks the app-bar New→Question (needs a
  loaded page); the real `H.startNewQuestion`
  (e2e-ad-hoc-question-helpers.js) navigates to `/question/notebook#<hash>`.
  data-model.ts `startNewQuestion` is the faithful navigate-based port — import
  that one. The app-bar port fails with "waiting for New" when the test never
  did a `goto` first. *Consolidation candidate: the two same-named exports are
  a trap; pick one behaviour.*

- **A chart element click while a drill popover is open is swallowed
  (Playwright only).** Bar-chart test: after the legend-item drill popover
  opens, `chartPathWithFillColor(...).click()` on a bar merely dismisses the
  open popover and never opens the bar drill (no popover in the failure DOM).
  Cypress's synthetic click reaches the SVG bar with the popover still open, so
  upstream never needed to close it. Fix: `page.keyboard.press("Escape")` +
  `expect(popover).toHaveCount(0)` before clicking the bar. General: dismiss any
  open Mantine drill popover before clicking a new chart element.

- **`cy.contains(regex)` = first match** (rule 3 family). ECharts renders two
  `June \d{1,2}, 2025` axis labels after the brush zoom; the unanchored
  `echartsContainer().getByText(/June .../)` hits strict-mode with 2 elements.
  `.first()` matches Cypress `.contains`.

- **`getByDisplayValue` is not on Playwright's `Page`.** Metabase's
  graph.dimensions picker (55484) is a Mantine Select whose current value is
  "Created At: Hour". Used the existing `findByDisplayValue(scope, value)`
  (filters-repros.ts) which scans `input,textarea,select` by `inputValue()` —
  the canonical port of `cy.findByDisplayValue`.

## Port notes (faithful, no adjustment needed)

- Snowplow describe ("chart click actions analytics") → no-op stubs (rule 6);
  the test still exercises the full drill UI (records/zoom/breakout/filter/auto,
  X-ray, compare-to-rest), only the event assertions are stubbed. Green,
  including the `page.goBack()` re-renders.
- `H.pieSliceWithColor` was the one missing pie-by-color variant (pieSlices
  already ported in dashboard-card-repros.ts) → added to support/chart-drill.ts.
- Brush gesture: `cy.trigger("mousedown"/"mousemove"/"mouseup", x, y)` at
  element-relative coords → `brushChart` resolves query-visualization-root's
  bounding box and drives the real mouse (down at start, move to end, up). Real
  mouse events are what ECharts' brush hit-tests; zoom + `/api/dataset` fire as
  expected.
- Pie hovers/clicks used `hover({force:true})`/`click({force:true})` (the pie
  wedge `<text>` label overlays the path — established ECharts pie gotcha). The
  5334 "Other" slice click uses `position:{x:30,y:box.height/2}` + force to port
  `realClick({x,y})`.
- `H.createQuestion(details,{visitQuestion:true})` → `api.createQuestion` +
  `visitQuestion(page,id)`. `H.visitQuestionAdhoc` (query) →
  `visitAdhoc`; native-autorun (15785) → `visitNativeAdhoc` (viz-charts-repros).
- 14495 flips to normal user after writing the permissions graph as admin;
  drill's `See these People` → `/api/dataset` waited before the click; asserted
  `body.error` falsy — passes (no masked-request trap).
