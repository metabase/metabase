# visualizer-basics (dashboard/visualizer/basics.cy.spec.ts)

Ported 21 tests → `tests/visualizer-basics.spec.ts`. New helpers in
`support/visualizer-basics.ts`. Verified on the jar (slot 6),
`--repeat-each=2` = 42/42 green, tsc clean. No `test.fixme`, no product-bug
claims.

## Fixes classified

All fixes are **known-gotcha** classifications (the brief flagged them) — no new
gotchas discovered. Recording the concrete instances:

1. **Zero-area SVG `<path>` is "hidden" to Playwright** (rule 3 / ECharts class).
   `chartGridLines` and `goalLine` resolve horizontal/dashed line paths with a
   zero-height bounding box, which Cypress `.should("exist")` accepts but
   Playwright `toBeVisible()` rejects. Ported "exist" as `toBeAttached()`.

2. **`getByLabel` is substring by default** — `getByLabel("Undo")` also matched
   the `<svg aria-label="undo icon">` inside the button (strict-mode violation).
   Fixed with `{ exact: true }` on the Undo/Redo buttons.

3. **`should("not.be.visible")` on a clipped element ≠ `not.toBeVisible()`**
   (documented wave-9 gotcha). The visualizer settings sidebar, when closed,
   sits in a **zero-width `overflow:hidden` grid column** (`.settingsSidebar`)
   while its content div keeps `min-width:320px` — so Playwright calls it
   visible (non-empty box) while Cypress sees it clipped. Ported the
   "history-reset ⇒ sidebar closed" assertion as **`not.toBeInViewport()`**.
   Confirmed against `Visualizer.module.css` (`.settingsSidebar { overflow:
   hidden }` + `--right: 0` when `!isVizSettingsSidebarOpen`).

4. **CSS `:hover`-gated `visibility:hidden` button, revealed only over the
   header row** (rule 4 hover class). The datasource "…" actions button
   (`.parent:hover .ActionsButton { visibility: visible }`) lives in the
   data-source-list-item's *header* Flex, but the list-item's center sits over a
   column row, so `list-item.hover()` never triggered the `:hover`. A
   force-click on the still-`visibility:hidden` button missed and closed the
   modal. Fixed `resetDataSourceButton` to hover the **source-name text**
   (inside `.parent`) then real-click the now-visible Menu.Target.

5. **`waitForResponse` doesn't consume past responses; `cy.wait` does**
   (documented). Upstream's two post-save `cy.wait("@cardQuery")` (VIZ-926) are
   satisfied on the dashboard where the re-render fires its queries via the
   **dashcard** endpoint, not `/api/card/:id/query` — so a
   `waitForCardQueries(2)` counter never reached 2 and hung to timeout. Dropped
   the gate; the following `toHaveCount(3)/(2)` assertions already auto-retry
   through the render. (Single-`@cardQuery` waits elsewhere port fine.)

## Migration dividends

- **Vacuous-modal guard.** `showDashcardVisualizerModal`'s loading checks are
  `toHaveCount(0)`, which pass **whether or not the modal opened** — a false
  green if the open click misfires. Added `await expect(dialog).toBeVisible()`
  before the loader checks so a non-opening modal fails at the helper, not three
  assertions later. (This surfaced the reset-modal-close bug above rather than
  masking it.) Cheap strengthening; worth folding into the shared visualizer
  helper at consolidation.

## Notes for the port

- No drag/drop: this spec builds multi-series charts via "Add more data" /
  `selectDataset` (the `swap-dataset-button`), so no dnd-kit helpers were
  needed despite the brief's heads-up.
- Dropped never-awaited intercepts `@dataset` and `@dashcardQuery` (registered
  upstream, never `cy.wait`ed). `@cardQuery` ported as `waitForCardQueries`.
- Public sharing + static embedding come pre-enabled by the default snapshot
  (`default.cy.snap.js`), so the sharing/embedding describe needed no extra
  setup beyond `signInAsAdmin`.
- EditableText titles (`visualizer-title`) are a `<textarea>`; `findByDisplayValue`
  targets them, so title reads use `getByTestId("visualizer-title")` +
  `toHaveValue`, and edits use the click+select-all+type+blur dance.

## Consolidation candidates

- `saveDashcardVisualizerModal` / `showDashcardVisualizerModal` duplicate
  `support/dashboard-card-repros.ts`; the well / data-importer / dataset helpers
  are the visualizer surface that should become one shared module.
- `createQuestion` / `createNativeQuestion` / `createDashboard` (with
  enable_embedding) / `addQuestionToDashboard` duplicate api helpers in
  embedding-dashboard.ts / filters-repros.ts etc.
