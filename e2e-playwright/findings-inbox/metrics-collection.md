# metrics-collection

Source: `e2e/test/scenarios/metrics/metrics-collection.cy.spec.js` (5 tests)
Port: `tests/metrics-collection.spec.ts`

## Result
5/5 green on the jar (slot 4, COMMIT-ID 751c2a98); 10/10 under `--repeat-each=2`.
tsc clean. No fixmes, no product-bug claims.

## Fixes / classification
Clean port — no stabilization fixes were needed. Every helper already existed
as a shared import (known gotchas were pre-avoided):

- Pinned/unpinned sections + item menus → `support/collections.ts`
  (getPinnedSection, getUnpinnedSection, openPinnedItemMenu,
  openUnpinnedItemMenu, waitForCardQuery).
- popover / modal / navigationSidebar → `support/ui.ts`.
- undo (clicks the newest toast) → `support/dashboard-parameters.ts`;
  undoToastList → `support/organization.ts`.
- createQuestion (passes `collection_position` straight through the POST, as the
  Cypress `question()` helper does) → `support/factories.ts`.

No new helper module was created; `openArchive` stayed spec-local as it was
upstream.

## Port notes (mechanical, per PORTING rules)
- `should("be.visible")` / `findByText` string args → exact getByText, scoped to
  the pinned section (mirrors Cypress `.within()`).
- `should("not.exist")` → `toHaveCount(0)`; `should("contain", "18,760")` →
  `toContainText`.
- The awaited `@cardQuery` intercept (bookmark test, awaited twice) → two
  `waitForCardQuery` waits registered before their triggers: the `goto` and the
  Bookmark click (rule 2). The pinned card re-runs its query on bookmark ("blink").
- Toast-text assertions use `undoToastList(page).last()` (newest toast) — robust
  against a lingering fading toast under CI load (transient-UI rule), and matches
  upstream's own `.last()` usage on the accumulating-toast assertions.
- Preserved the U+2019 apostrophe in "Don’t show visualization".

## Dividends
None. Faithful 1:1 port; behaviour matches upstream on the jar.
