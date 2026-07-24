# new-menu.cy.spec.js → tests/new-menu.spec.ts

Small spec (2 tests). Both pass on the jar (slot 4), 4/4 under --repeat-each=2,
tsc clean. No fixmes, no product-bug claims — cross-check not required.

## Fixes / notes (all mechanical, known gotchas)
- `cy.findByText("Question"|"SQL query")` → `getByText(name, { exact: true })`
  (PORTING rule 1: testing-library string findByText is exact).
- `cy.url("should.contain", ...)` was retried → `expect.poll(() => page.url())
  .toContain(...)` (retried-URL gotcha).
- `H.NativeEditor.get().should("be.visible")` → shared `nativeEditor(page)` from
  support/native-editor.ts.
- beforeEach open flow (visit "/" + click "New") wrapped in new
  support/new-menu.ts `openNewMenu`, which imports `newButton` from ui.ts
  read-only.

## Dividends
None. Faithful 1:1 port; no new gotchas.

## Consolidation flag
`openNewMenu` is a thin wrapper (goto "/" + newButton click). If more navbar
"New" specs land, this is the natural home for shared "+ New" menu helpers.
