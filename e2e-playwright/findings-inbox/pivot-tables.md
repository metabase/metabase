# pivot-tables.spec.ts — porting findings

Source: `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` (1507 lines, no gating tags).
Target: `tests/pivot-tables.spec.ts`. New helpers in `support/pivot-tables.ts`.

Verified on the CI EE jar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98), slot 1,
`PW_PER_WORKER_BACKEND=1 PW_ACTION_TIMEOUT=30000`.

## Fixes classified

### Known gotchas (should have been avoided in the first pass)
- **Mixed-content text nodes → exact getByText misses them** (PORTING "Mixed-content
  text nodes"). Two hits:
  - App-bar "Started from <link>Cypress Pivot Table</link>" — `getByText("Started
    from", {exact:true})` fails because Playwright compares the *full* element text.
    Fixed with `getByText(/Started from/)`.
  - Download xlsx hint: the hint Text wraps a "Read the docs" `<Link>`, so the full
    element text includes "Read the docs". Fixed with substring `getByText(HINT_TEXT)`
    + `.first()` (the substring also matches the enclosing Flex/Stack).

### New gotchas (worth adding to PORTING.md)
- **A native-query pivot error only renders after the query RUNS.** The Cypress
  `H.visitQuestionAdhoc({type:native, display:pivot})` autoruns the native query
  (`runQueryIfNeeded` → `runNativeQuery`), and `checkRenderable` throws the
  "Pivot tables are only supported for questions built in the query builder"
  error only after inspecting the result columns' `source`. Navigating the ad-hoc
  hash directly (as I first did, because `permissions.visitQuestionAdhoc` refuses
  native+autorun) leaves the editor at "Here's where your results will appear" and
  the error never renders. Fix: use `charts-extras.visitNativeQuestionAdhoc`
  (autorun=false + runNativeQuery).

- **dnd-kit resize handles that slide as you drag need the handle re-queried
  before EACH pointer event, not a fixed coordinate.** The pivot column-resize
  handle's `left` style is `initialWidth + transform.x`, so it moves right while
  you drag it. `H.moveDnDKitElementByAlias` re-queries the element (`getElement()`)
  and fires each offset relative to its CURRENT position, which compounds: a
  nominal `{horizontal:100}` lands as a +120 delta once the +20 activation nudge
  has shifted the handle. A Playwright drag that captures the box once and fires
  fixed clientX comes up exactly 20px short (measured 200 vs the expected 220) —
  and real-mouse `moveDnDKitElement` was additionally flaky (80 one run, 120 the
  next). `moveDnDKitPointer` (support/pivot-tables.ts) dispatches synthetic
  PointerEvents and re-reads `boundingBox()` before every move; deterministic.
  DEFAULT_CELL_WIDTH is 100, so base(100)+120 = 220 — the +20 is load-bearing, not
  slop. Confirmed the code path (`PivotTableCell.tsx` ResizableHandle:
  `newWidth = initialWidth + prevTransform.x`), so no jar cross-check needed.

- **react-virtualized `ScrollSync` grids ignore a synthetic `scrollLeft`
  assignment.** The pivot body is a react-virtualized `Grid` whose `scrollLeft` is
  a controlled prop driven by `ScrollSync` (PivotTableInner.tsx). Setting
  `el.scrollLeft = 10000` + `dispatchEvent(new Event("scroll"))` gets re-imposed
  back to the controlled value — the grid never moves (verified: top-header still
  showed the FIRST months, "Row totals" never rendered). Cypress `.scrollTo()`
  works because it drives a real scroll the component reacts to. Fix: `grid.hover()`
  + `mouse.wheel(10000, 0)` — a real wheel event ScrollSync acts on. Also note the
  Cypress `should("be.visible")`-after-scroll asserts the far-right column is
  RENDERED (react-virtualized only mounts near-viewport cells); ported as
  `toBeVisible()` (rendered), not `toBeInViewport()` — the header can render just
  past the viewport edge.

- **Adding a Sort in the notebook does NOT auto-run the query.** In 22872 the
  Cypress `cy.wait("@pivotDataset")` after picking the sort column looked like the
  sort re-ran the query, but the pivot query actually fires on the subsequent
  Visualize click. Register the `waitForResponse` before the sort pick but await it
  AFTER Visualize.

- **A conditional-formatting operator is a Mantine `Select`; its display-text div
  is not clickable.** `cy.findByText("is equal to").click({force:true})` works in
  Cypress (jQuery force-clicks any element), but the div has a zero box in
  Playwright and even `{force:true}` fails ("Element is not visible"). Open the
  select (`getByTestId("conditional-formatting-value-operator-button")`) and pick
  the `role="option"`.

## Duplication flagged for consolidation (never edited shared files)
- `support/pivot-tables.ts#updatePermissionsGraph` duplicates the same helper in
  `dashboard-repros.ts` (and click-behavior.ts).
- `support/pivot-tables.ts#findDisplayValue` overlaps `dashboard-cards.ts#inputWithValue`
  and `filters-repros.ts#findByDisplayValue` (both input-only; mine also scans
  `<select>` for the Mantine value-formatting input).
- `support/pivot-tables.ts#{visitPivotAdhoc,createPivotQuestion}` are typed wrappers
  only needed because `permissions.visitQuestionAdhoc` / `api.createQuestion` param
  types omit `visualization_settings` (both forward it at runtime). Widening the
  shared helpers' param types would remove the wrappers.
- `moveDnDKitListElement` is the list-index sibling of dashboard-cards.ts's dnd movers.
