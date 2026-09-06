# collections.cy.spec.js → collections.spec.ts

Source: `e2e/test/scenarios/collections/collections.cy.spec.js` (1363 lines, 32 tests).
Verified on the CI uberjar (slot 5): 32/32 green, 64/64 under `--repeat-each=2`, tsc clean.
New helpers in `support/collections-core.ts`; drag/drop reuses `support/collections.ts dragAndDrop`.

No `test.fixme`, no product-bug claims — the port is faithful and fully green, so no
Cypress cross-check was required.

## Fixes classified

### NEW gotcha (candidate for PORTING.md)
- **`filter({ has: scope.getByText(...) })` breaks when `scope` is a Locator.**
  A spec-local helper took a `scope` (page *or* `collectionTable(page)`) and built both
  the row locator AND the `has` text locator from it:
  `scope.getByRole("row").filter({ has: scope.getByText(item) })`. When `scope` is the
  collection-table Locator, the `has` selector is anchored at the collection-table — but
  it's matched *inside each row*, which is the table's descendant, so it can never
  resolve. Symptom: `locator.hover`/`click` times out "waiting for … filter({ has: … })"
  even though the row is plainly in the page snapshot. Fix: always build the `has` text
  locator from `page`, never from a Locator scope (rows still come from `scope`). Cost two
  failing tests that looked like "the row doesn't exist". Two-arg helpers that scoped to
  `collection-table` (openEllipsisMenuFor / getRowCheckbox / selectItemUsingCheckbox) all
  had it.

### KNOWN gotchas (correctly anticipated / already documented)
- **Mixed-content text nodes** (PORTING.md): the pagination range renders
  `{n} - {m}` as direct text nodes inside a span that *also* holds the "of {total}" child
  spans. testing-library's `getNodeText` matched only the direct text nodes ("1 - 25");
  Playwright's `getByText` sees the element's full text ("1 - 25 of 30"), so exact match
  found nothing. Ported as a substring `toContainText` on the `getByLabel("pagination")`
  container.
- **Mantine spreads a Modal's data-testid onto its ROOT** (documents-core note) +
  **`should("be.visible")` is an ANY-of-set match** (rule 3): `new-collection-modal` is
  on the hidden Modal root wrapper, and a closed modal from an earlier creation lingers,
  so `getByTestId("new-collection-modal").toBeVisible()` picked the hidden root. Fixed by
  asserting the visible dialog itself: `getByRole("dialog", { name: "New collection" })
  .filter({ visible: true })`.
- **Retroactive `cy.wait` / count-based waits that don't fire on the jar** (rule 2 /
  "cy.wait consumes past responses"): `moveOpenedCollectionTo` upstream did
  `cy.wait(["@getCollectionItems", "@getCollectionItems"])`, and the "update the UI" test
  did `cy.wait("@getTree")` after each move. Neither reliably fires a *new* matching
  response on the jar (the tree is RTK-cached; the move-opened picker opens at the tree
  root and doesn't fire two item loads), so the Playwright `waitForResponse` equivalents
  hung to timeout. Dropped both — the retrying sidebar assertions (ensureCollection*) and
  the auto-waiting picker-item click settle the flow.

### Faithful-port notes (no behavior change)
- Snowplow helpers → no-op stubs (rule 6); the UI flows in the "new collection button"
  describe are ported for real.
- `@getPinnedItems` intercept was registered but never awaited upstream → dropped.
- Both spec-local `visitRootCollection` variants map to `visitCollection(page, "root")`.
- Sign-in as cached-but-not-in-USERS users ("none", "nocollection") via
  `mb.signIn(name as UserName)` (established pattern) — sets both browser cookies and the
  api session in one call.
- `H.createDashboard(\`dashboard ${i}\`)` (a string arg — upstream shape bug that yields
  the default name) ported as `createDashboard({ name })`; only the item count matters.
  `collection_position: null` dropped (it's the default; the api helper types reject it).
