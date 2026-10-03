# search-typeahead

Port of `e2e/test/scenarios/search/search-typeahead.cy.spec.js`
→ `tests/search-typeahead.spec.ts`. 3 tests, all green on the jar (slot 2),
6/6 under `--repeat-each=2`. No new helpers (all existed in `support/search.ts`,
`support/command-palette.ts`, `api.updateSetting`).

## Fixes classified

- **New gotcha — the global SearchBar typeahead dropdown is CLICK-gated, not
  focus-gated.** `SearchBar.tsx` only mounts the dropdown when `isActive`, and
  `isActive` is set by `onInputContainerClick` (a click on the input container)
  — there is no `onFocus` that sets it. Cypress `.type()` clicks-to-focus, so
  upstream got the dropdown for free; Playwright `pressSequentially()` only
  focuses the element, so the dropdown never appeared and the results count sat
  at 0 through the full timeout (both admin+normal typeahead tests). Fix: click
  the search bar before `pressSequentially`. Generalizes PORTING rule 5 — for a
  search box whose dropdown is click/active-gated, a bare focus-then-type is not
  equivalent to Cypress `.type()`; click first.

## Fidelity notes (no bug/fixme — recorded for the port)

- `findByTestId("loading-indicator").should("not.exist")` ported as
  `toHaveCount(0)`, but that testid (`NavbarLoadingView`) is not the search
  dropdown's spinner (Mantine `Loader`, no testid), so it is effectively a
  no-op wait in both harnesses. The real settle is the auto-retrying results
  count. Kept faithful.
- `personalCollectionsLength = Object.entries(USERS).length` uses the upstream
  `e2e/support/cypress_data.js` USERS map = **10** users (admin, normal, nodata,
  sandboxed, readonly, readonlynosql, nocollection, nosql, none, impersonated),
  each with a personal collection in the default snapshot. Mirrored as a spec
  const (`ADMIN_PERSONAL_COLLECTIONS = 10`); the spike's own `support/sample-data.ts`
  USERS is a 5-user credential subset and must NOT be used for this count.
- `findAllByText(/personal collection$/i)` scoped to the per-result
  `search-result-item-name` testid (not a bare `getByText` on the list) to avoid
  Playwright's nesting-ancestor over-match; matched with the same `/i` regex.
