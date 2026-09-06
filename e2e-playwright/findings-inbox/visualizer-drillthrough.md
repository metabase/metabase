# visualizer-drillthrough

Port of `dashboard/visualizer/drillthrough.cy.spec.ts` → `tests/visualizer-drillthrough.spec.ts`
(2 tests: `should work`, VIZ-979 brush). Green on the jar (COMMIT-ID 751c2a98,
slot 2), 4/4 under `--repeat-each=2`, tsc clean.

## New helpers
`support/visualizer-drillthrough.ts` (new file only, per parallel-agent rule):
- `cartesianChartCircleWithColor(scope, color)` — scoped port (the page-global
  one in viz-charts-repros.ts can't be used: a dashboard renders six
  chart-containers → strict-mode multi-match).
- `applyBrush(scope, left, right)` — scoped port (metrics-explorer's is page-global).
- `waitForDataset(page)` / `trackDatasetRequests(page)` — the `@dataset`
  intercept + `cy.wait` / `cy.get("@dataset.all")` patterns.

Everything else imported read-only (chartPathWithFillColor, echartsTextExact,
chartLegendItem, queryBuilderFiltersPanel, tableInteractiveHeader,
clickActionsPopover, etc.).

## Fixes classified

### New gotcha (add to PORTING.md) — Cypress `.get()` chained off a subject BREAKS SCOPE
`H.getDashboardCard(5).get("polygon").first()` does **not** scope to card 5.
Cypress `.get()` is a parent/query command that starts from the document root
(or the enclosing `within()`), so it discards the `getDashboardCard(5)` subject
and queries **all** `polygon`s on the page — `.first()` is the first polygon in
the whole DOM. On this dashboard that's the *regular* funnel (card 4, which
precedes the scalar funnel in DOM order). So the upstream "scalar funnel" step
actually re-drills the **regular** funnel, which is why both funnel blocks assert
the identical `"Views is equal to 600"`.

A card-scoped Playwright port (`getDashboardCard(page,5).locator("polygon")`)
faithfully clicks the *actual* scalar funnel — whose visualizer METRIC column
combines three native `SELECT … as "views"` cards — and the drill filters that
card's raw lowercase column, rendering `"views is equal to 600"`. That looks like
a faithful result but is a **drift**: it clicks a different element than upstream.
Fix: port `.get("polygon")` as page-global `page.locator("polygon")`, never
scoped to the card. General rule: **when Cypress chains `.get(sel)` off another
command, it is NOT scoped — port it page-global (or to the active `within`),
not as a descendant of the previous subject.** (`.find()`, by contrast, IS a
descendant query and should scope.)

### Fidelity cross-check that caught it
`views` vs `Views` casing is deterministic app behaviour (backend `/api/dataset`
returns `display_name: "views"` for a native `as "views"` column — no
humanization), and testing-library's matcher is case-sensitive
(`normalizedText === String(matcher)`). So the card-scoped port failing on
lowercase looked like it *might* be a real app/casing issue. The mandatory
cross-check settled it: the **original Cypress `should work` passes on this same
jar** (`--browser chrome`, MB_JETTY_PORT=4102, sample-DB re-pointed) rendering
`"Views is equal to 600"` — proving the port had drifted (wrong polygon), not
that the app was wrong. Two wrong theories (real-mouse-hover-picks-source-series,
then dispatchEvent) were discarded before the `.get()` scope-break was found.

## Notes / no dividend
- No product bug. The casing difference was entirely a port-scope artifact.
- @dashcardQuery intercept dropped (registered upstream, never awaited).
- Pie drill force-clicks the wedge path (existing wave-13 gotcha).
