# native-query-drill.cy.spec.ts → tests/native-query-drill.spec.ts

Source: `e2e/test/scenarios/question/native-query-drill.cy.spec.ts` (467 lines).
New helper module: `support/native-query-drill.ts`.

## Result

- 16 tests ported, all faithful, no fixmes. Green on the CI EE jar (slot 4):
  16/16, and 32/32 under `--repeat-each=2` (54s). tsc clean for both new files.
- No issue numbers in the original (none to preserve).
- Drill coverage from a NATIVE query's result table/chart: save-to-drill on an
  ad-hoc native query, column-extract, combine-columns, column-filter,
  distribution, quick-filter (chart point), sort, summarize (distinct/sum/avg),
  summarize-over-time, unsupported-drill negatives, brush filters (timeseries /
  numeric / map coordinates), and the dashboard-card equivalents.

## Fixes classified (both are known gotchas — no product findings)

- **mixed-content-text (known gotcha).** The column-extract-unit rows render the
  unit label as a bare text node next to an example span (`Quarter of year` +
  `Q1, Q2` inside the same button). testing-library `findByText("Quarter of
  year")` matched the text node; Playwright exact `getByText` compares full
  element text and missed it. Ported as a case-sensitive substring regex
  (`getByText(/Quarter of year/)`).

- **cypress-real-events realMouseMove is element-relative, not a delta — plus
  leaflet-draw reads the box from the last mousemove (known-adjacent gotcha).**
  The map box-filter uses
  `.realMouseDown({x:left,y:top}).realMouseMove(right-left, bottom-top).realMouseUp({x:right,y:bottom})`.
  `realMouseMove(x, y)` positions the cursor at (x, y) *relative to the element*
  (it is NOT a delta), so the final pointer position is `(right-left,
  bottom-top)` = (400,400), and leaflet-draw's rectangle tool takes its bounds
  from the shape's last mousemove — the mouseup coordinate is ignored. Porting
  the mouseup coordinate `(right, bottom)` = (500,500) as the far corner drew a
  larger box and caught an extra point (**2 rows, expected 1**). Fixed in
  `applyBoxFilter` by ending the drag at element-relative `(right-left,
  bottom-top)`. Verified 1 row on the jar. This is a good addition to the
  "`cy.trigger`/real-events geometry ≠ Playwright real mouse" family already in
  PORTING.md; the leaflet-draw "bounds come from last mousemove, not mouseup"
  detail is the new wrinkle.

## Dividend

None. No product bug, no Cypress-masked issue. The two fixes above are harness
fidelity, not app behaviour.

## Port decisions worth noting

- `H.visitQuestionAdhoc(nativeQuestion)` autoruns the native query (its
  `runQueryIfNeeded` clicks Run), so the first test maps to the existing
  `visitNativeQuestionAdhoc` (charts-extras.ts), not the throwing
  native-autorun branch of `visitQuestionAdhoc`.
- `H.cartesianChartCircle().eq(0)` → `cartesianChartCircles(page).first()`
  (metrics.ts). The dashboard chart-drill circle is page-scoped rather than
  `getDashboardCard().within(...)` — there is a single dashcard, so the single
  page-level chart-container is unambiguous.
- `H.applyBrush` reused as-is from metrics-explorer.ts (real-mouse drag at
  y=100, element-relative); the spec-local `applyBrushFilter` /
  `ensureEchartsContainerHasSvg` / `applyBoxFilter` live in the new module.
- `cy.wait("@dataset")` / `@saveCard` → `page.waitForResponse` registered
  before the triggering click (POST /api/dataset, POST /api/card).
