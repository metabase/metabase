# personal-collections

Port of `e2e/test/scenarios/collections/personal-collections.cy.spec.js`
→ `tests/personal-collections.spec.ts`. 6 tests: 5 in the "admin" describe
(one `@skip`) plus a data-driven "all users" describe that runs the same
edit/archive test for all 10 snapshot users (metabase#24330, #8406, #15339,
#15343).

Verified on the CI EE uberjar (COMMIT-ID 751c2a98), slot 2: 14/14 green + 1
skipped, and 28/28 + 2 skipped under `--repeat-each=2`. tsc clean.

## Result

Faithful port, no fixmes, no product-bug claims — so no Cypress cross-check was
needed. New code: one small domain module (`support/personal-collections.ts`)
holding two derived constants, the mirrored USERS name map, and two UI helpers.
Everything else imported read-only from shared modules.

## Fixes / adaptations (all mechanical, all covered by existing gotchas)

- `{ tags: "@skip" }` (metabase#24330) → `test.skip` with the body ported
  verbatim (gate: has-skips).
- Response-modifying `cy.intercept("/api/session/properties", req => req.continue(res => …))`
  → `page.route` that `route.fetch()`es the real response and rewrites
  `active-users-count`; a single mutable var covers the two successive
  intercepts (1 then 2). `not.exist` → `toHaveCount(0)`, `be.visible` →
  `toBeVisible`.
- `cy.request("PUT", "/api/user/:id", …)` / `POST /api/collection` → `mb.api.put`/
  `mb.api.post` (api client mirrors cy.request); `H.createCollection` →
  shared `createCollection` (dashboard-core.ts).
- `cy.findByDisplayValue("Foo")` on the collection-name EditableText (renders a
  `<textarea>`) → shared `findByDisplayValue` (filters-repros.ts) which scans
  input+textarea+select — the documented EditableText gotcha.
- `cy.findByPlaceholderText("Add title").type("1")` APPENDS ("Bar"→"Bar1"):
  Cypress `.type()` parks the caret at end. Ported as focus → `press("End")` →
  `pressSequentially` → `blur()` (fill() doesn't mark EditableText dirty; rule 5
  + wave-5 EditableText gotcha). The name field carries placeholder "Add title"
  even while showing a value, so `getByPlaceholder` still resolves it.
- After the rename I call `openNavigationSidebar()` before the next sidebar
  click — a rename via EditableText can collapse the navbar (PORTING gotcha).
- `findByText`/`findByLabelText` string args → `{ exact: true }` (rule 1),
  including the "Other users' personal collections" aria-label and the 10 user
  full names on `/collection/users`.
- The "all users" loop signs in via `signInWithCachedSession(context, key)` for
  all 10 cached users (mb.signIn is typed to only 5) — the flow is UI-only, so
  no mb.api session is needed.

## Dividends

None. Faithful 1:1 port; no bug surfaced, no test strengthened beyond the
mechanical `.first()` guards on the user-name assertions.
