# column-shortcuts

Port of `visualizations-tabular/column-shortcuts.cy.spec.ts` → `tests/column-shortcuts.spec.ts`.
19 tests (extract-part-of-column × date/email/url + summarized/breakout/scroll;
combine-columns × 3). 19/19 green on the jar (slot 2), 38/38 under
`--repeat-each=2`. tsc clean. No fixmes, no product-bug claims.

New helpers: `support/column-shortcuts.ts` only (extractColumnAndCheck,
combineColumns, selectColumn, openOrdersTable-with-limit). No shared files edited.

## Dividend — assertion strengthened (Cypress-masked overflow-clipping)

The "should disable the scroll behaviour after it has been rendered" test asserts
the ID column header is still on screen after adding a column and re-sorting (i.e.
the table did NOT auto-scroll the new column into view). Upstream uses
`should("be.visible")`, which in Cypress treats overflow-clipped content as
invisible — so it genuinely catches the regression. A literal port to
`toBeVisible()` would be **vacuous**: Playwright's toBeVisible only checks
box + `visibility`, ignoring overflow-scroll clipping (PORTING.md), so an ID
header scrolled off the right edge still reads "visible". Ported as
`toBeInViewport()`, which faithfully preserves the test's intent. Another
instance of the documented `should(...be.visible)`-scrolling class — this one on
the positive side.

## Consolidation note (low priority)

`openOrdersTable` had to be re-implemented here because the shared
`support/question-settings.ts` port is simple-mode only and takes no `limit`
(these tests need `H.openOrdersTable({ limit: 1 })`). If an `openOrdersTable`
gains a `limit` param during consolidation, this local copy can be dropped.
