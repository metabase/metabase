# table-column-settings.spec.ts

Port of `e2e/test/scenarios/visualizations-tabular/table-column-settings.cy.spec.js`
(1140 lines, 29 tests, no gating tags). New helpers → `support/table-column-settings.ts`.

Verified on the CI EE uberjar (`751c2a98`, slot 3): **29/29 pass, 58/58 under
`--repeat-each=2`** (2.2m). tsc clean for the ported files. No `test.fixme`, no
product-bug claim — so no Cypress cross-check was required.

## Fixes needed while stabilising (2), both known gotchas

1. **"Add all"/"Remove all" group toggle — accessible name ≠ visible label
   text.** The FieldPanel group toggle (`FieldPanel.tsx`) is one Mantine
   `Checkbox` whose visible `<label>` text flips between "Add all"/"Remove all",
   but whose `aria-label` is the group displayName ("Products"). Cypress's
   `findByLabelText("Remove all")` matched the label *text* (testing-library
   tries multiple labelling strategies); Playwright's `getByLabel` uses the
   computed accessible name, which `aria-label` wins — so `getByLabel("Remove
   all")` resolves nothing and the click times out. Fixed by targeting the
   stable group toggle `getByLabel("Products", { exact: true })` for both the
   remove-all and add-all clicks (same physical control both times). This is the
   PORTING rule-4 / `getByRole` family of "the accessible name comes from
   somewhere other than the visible text" gotchas, applied to a group toggle.

2. **A body row exists in two quadrants → `[data-index=0]` matches 2 nodes.**
   `assertRowHeight` (`H.assertRowHeight`) did `tableInteractive().find([data-
   index=0]).should("have.css","height", ...)`; the interactive table renders
   each body row in both the pinned and unpinned body quadrants, so the locator
   matched two `role="row"` nodes and Playwright's strict mode threw. Cypress's
   `.find().should("have.css")` reads the *first* element's height, so `.first()`
   restores that semantics (both quadrants share the row height under test).
   Same family as the "double-render header cell" gotcha, on the body side.

## Column DnD (the flagged risk) — synthetic pointer, faithful to Cypress

Column reorder between pinned/unpinned sections uses dnd-kit's `PointerSensor`
(`use-columns-reordering.tsx`, activation distance 10). The `H.moveDnDKit
ElementByAlias` original fires `pointerdown` at the header element's top-left
(0,0), a threshold-exceeding move (20,20), then the offset move — all
*element-relative* — re-querying the element before every event, and `pointerup`
on `document`. Ported as `moveDnDKitColumnHeader` (synthetic `PointerEvent`s,
re-reading `boundingBox()` per event), the same shape as
`pivot-tables.ts#moveDnDKitPointer`.

Key detail: the drag must originate on the header's **inner text element**, not
the outer `header-cell`. dnd-kit's `useSortable` listeners live on
SortableHeader's `headerContent` div (`SortableHeader.tsx`); a pointerdown on
the parent `header-cell` would not reach them (events bubble up, not down).
`columnHeaderDragHandle` returns `tableInteractiveHeader().getByText(name,
{exact}).first()` — matching what `H.tableHeaderColumn` (`findByText`) resolved
to. Real-mouse was *not* used here.

Column *resize* (the unpin/re-pin-at-90% test) is a plain mousedown/mousemove
delta (not dnd-kit), reused as-is from `viz-tabular-repros.ts#resizeTableColumn`
(real-mouse delta). Worked first try, incl. the huge `containerWidth*0.7` move.

## Port adaptations worth noting (no new gotchas)

- **Dropped no-op top-level `limit: 5`.** Four fixtures (tableQuestion,
  tableQuestionWithJoinAndFields, nativeQuestion, nestedQuestion) carried
  `limit: 5` as a *sibling* of `query` (not inside it). That key isn't part of
  the `POST /api/card` payload (`StructuredQuestionDetails` doesn't define it;
  the backend ignores it), so it's a genuine no-op in Cypress too — dropped so
  the literals satisfy the shared `createVizQuestion` type. In-query `limit`
  kept. Behaviour identical (tests only assert column visibility).
- **`scrollVisualization("right")`** = `scrollTo("right", {force})` with no
  duration = an instant jump, so `scrollLeft = scrollWidth` is faithful and
  sidesteps the reduced-motion smooth-scroll trap.
- **`_removeColumn`/`_addColumn`** re-run the query on the checkbox toggle, so a
  `page.waitForResponse("/api/dataset")` is registered immediately before each
  toggle (replacing the beforeEach `cy.intercept(...).as("dataset")`). Hiding/
  showing (eye icons) is a client-side viz setting and fires no query — no wait.

## Consolidation candidates flagged in support/table-column-settings.ts

- `tableInteractiveBody` / `tableInteractiveHeader` / `tableInteractive
  ScrollContainer` are trivial testid wrappers that belong next to
  `models.ts#tableInteractive`.
- `moveDnDKitColumnHeader` duplicates `pivot-tables.ts#moveDnDKitPointer` (the
  synthetic-pointer dnd mover) with a different drag target.
- `openColumnOptions` / `assertRowHeight` overlap the models-metadata /
  ui-elements helper surface.
- Reused `createVizQuestion`, `createNativeVizQuestion`, `resizeTableColumn`,
  `getControlByDisplayValue` from `viz-tabular-repros.ts` (imported, not copied).
