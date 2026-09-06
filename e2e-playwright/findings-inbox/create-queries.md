# create-queries (permissions/create-queries.cy.spec.js)

Ported 8 tests (all UI-driven against the admin permissions table). Green on
the jar (slot 5): 8/8 first run, 16/16 under `--repeat-each=2`. tsc clean.
No `test.fixme`, no product bugs, no migration dividends.

## Fixes classified (all known gotchas — no new ones)

- **Playwright forbids duplicate test titles; Cypress allows them.** Upstream
  declares "should allow setting create queries to 'query builder only' in
  group view" twice in the same `describe` (a genuine upstream dup with
  near-identical bodies). Playwright treats a duplicate title as a hard error,
  not a warning, so the second copy is suffixed "(2)" with a comment; body is a
  faithful port. Worth adding to PORTING.md if it recurs — any spec with
  duplicate `it` titles will fail to even load.
- **Open options-popover before navigating away** (rule: park/close floating
  UI). `selectPermissionRow(...)` + `expect(popover).not.toContainText("Query
  builder and native")` leaves the Mantine popover open; a `keyboard.press(
  "Escape")` closes it before the next `selectSidebarItem` click. (Mantine
  Popover has no backdrop, so it wasn't strictly required here, but it's the
  safe faithful pattern.)
- `cy.contains` / `.findAllByRole("menuitem").contains(item)` ported as a
  case-sensitive substring via `filter({ hasText: RegExp })` + `.first()`
  (PORTING "Rule 1 is about findByText, not cy.contains"). `H.assertPermission
  Table`'s `have.text` → `toHaveText` (exact, whitespace-normalized).
- `cy.findByTextEnsureVisible("Sample Database").click()` (drill db → tables)
  scoped to the permission table to hit the row cell — `drillIntoDatabaseRow`.

## Reuse

- `modifyPermission` reused read-only from support/command-palette.ts;
  `modal`/`popover` from support/ui.ts. New helpers (selectSidebarItem,
  selectPermissionRow, assertPermissionTable, getPermissionRowPermissions,
  drillIntoDatabaseRow, ALL_USERS_GROUP, NATIVE_QUERIES_PERMISSION_INDEX) in
  support/create-queries.ts.
