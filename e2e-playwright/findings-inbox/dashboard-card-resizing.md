# dashboard-card-resizing (dashboard-cards/dashboard-card-resizing.cy.spec.js)

Ported all 5 tests faithfully (3 in "dashboard card resizing", 1 "trend charts",
1 "issue 31701"). Verified on the CI uberjar, slot 1: 5/5 green, 10/10 under
`--repeat-each=2`. tsc clean. No `test.fixme`, no product-bug claims.

New helpers: `support/dashboard-card-resizing.ts` (VISUALIZATION_SIZES /
getMinSize / getDefaultSize, the mock-question factories, and the resize drag).

## Gotcha (worth adding to PORTING.md): React-Grid-Layout resize is react-draggable, not dnd-kit

`H.resizeDashboardCard` drags a dashcard's `.react-resizable-handle`. This handle
is a react-draggable `<DraggableCore>`, a DIFFERENT mechanism from the dnd-kit
sortables the dnd.ts helpers (`moveDnDKitPointer` / `moveDnDKitElementSynthetic`)
target — those are the wrong tool here. The faithful port dispatches real
`MouseEvent`s:
- `mousedown` on the HANDLE element (bubbles to React's delegated root listener,
  which is where react-draggable's `onMouseDown` lives);
- `mousemove` / `mouseup` on `document` (react-draggable attaches its own raw
  document listeners on drag-start).

A real Playwright mouse (`page.mouse`) can NOT do the min-size test: it drags to
hugely negative absolute coordinates (`clientX = -defaultWidth * 200`, e.g.
-2400) to clamp the card to its minimum, and a real cursor can't reach off-screen
negatives — a synthetic MouseEvent carries them verbatim. Confirmed against
`GridLayout.tsx` (react-grid-layout) and a green min-size clamp on the jar.

The metabase#70451 drift test presses the handle, moves +200/+150, and — like the
Cypress original — leaves the drag in flight (no mouseup) to assert the handle
followed the cursor within 50px. Ported as `startResizeDrag` (no release) +
`resizeHandleCenter`.

## Gotcha (already known — pivot query path): `/api/card/**/query` includes the pivot endpoint

The "default sizes" test intercepts `POST /api/card/**/query` per added sidebar
card. Pivot cards query via `/api/card/pivot/:id/query`, so a `\/api\/card\/\d+\/query`
regex misses the MOCK_pivot_QUESTION add and the per-card wait times out on that
iteration. Match `\/api\/card\/.+\/query` to mirror the Cypress `**` glob. (First
draft failed exactly here; fixed and green.)

## Anchoring the save on card count (known gotcha, applied)

Added `await expect(getDashboardCards(page)).toHaveCount(17)` between the last
sidebar add and `saveDashboard` — the documented async-card-add / saveDashboard
race. No trouble once anchored.

## Minor port notes

- `TEST_QUESTIONS` is exposed as `getTestQuestions()` (a fresh array per call), not
  a shared const: the upstream "default sizes" test sorts it in place, which under
  shared module state would leak ordering into sibling tests.
- The 13 chart-type mock questions share one identical query (only `display`
  differs), and scalar/gauge/progress share another; that's upstream's design and
  is fine — each is a distinct card id so each fires its own card query.
