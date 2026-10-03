# collection-picker-tenants

Port of `collections/collection-picker-tenants.cy.spec.ts` → `tests/collection-picker-tenants.spec.ts`.

- Size: 4 tests. Verified on the jar (slot 3): 4/4 green, 8/8 under `--repeat-each=2`. tsc clean.
- EE-gated (pro-self-hosted token; `use-tenants` + `shared-tenant-collection` namespace). Runs on the EE jar.
- No fixmes, no product-bug claims, no infra gates hit — the whole flow (tenant setup via `POST /api/collection` with the namespace, official-badge suppression, Collection-type picker toggle) works on the jar.

## Fixes / classifications (all Known-gotcha, avoided by the brief — no new gotchas)

- **Shared-helper reuse (no re-implementation).** The Cypress module-local `createSharedCollection`
  is byte-identical to `createTenantCollection` in the existing
  `entity-picker-shared-tenant-collection.ts`. Re-exported it from the new
  `support/collection-picker-tenants.ts` (aliased to `createSharedCollection`) rather than
  re-implementing — new file only, shared file imported read-only per the brief.
- **Two genuinely-new helpers** in the new file: `createNewCollectionFromHeader` (the in-page
  collection-*header* `collection-menu` "Create a new collection", distinct from the sidebar
  `startNewCollectionFromSidebar`), and `selectSharedCollectionInPicker(page, name)` — a
  generalisation of `selectTenantSubCollectionInPicker` for an arbitrary target, carrying the same
  toPass re-click loop around the tenant-root → child re-render race.
- **`should("not.exist")` guarded (rule: negatives can't pass on an unmounted modal).** Every
  absent-"Collection type"/"Regular"/"Official" check is preceded by a positive guard that the
  new-collection modal has rendered (`collection-picker-button` visible or containing the expected
  target text). Ported as `toHaveCount(0)`.
- **String args → exact** (rule 1): `findByText("Regular"|"Official"|"Make collection official"|
  "Remove Official badge")` and `cy.button("Select")` → `{ exact: true }`. `findByText(/Collection
  type/i)` kept as the case-insensitive regex it already was.
- Popover-close via `getByTestId("app-bar").click()` and modal-scoped `getByLabel("Close")`, faithful
  to the original.

## Dividends
None. Faithful port; the app behaves correctly on the jar. No Cypress cross-check was needed (nothing
to fixme / no bug claimed).
