# api-keys.cy.spec.ts → tests/api-keys.spec.ts

Source: `e2e/test/scenarios/admin-2/api-keys.cy.spec.ts` (370 lines).
New helper module: `support/api-keys.ts` (no shared files edited).

## Result

- 9 tests ported, all issue-number-free (none in the original). Faithful 1:1.
- **9/9 green on the jar (slot 4), 18/18 under `--repeat-each=2`.** No fixmes,
  no product-bug claims, so no Cypress cross-check was required.
- tsc clean for both new files.
- First-run green with zero iteration.

## Security note (API keys)

The spec creates API keys and the app generates the key value at runtime. The
port asserts the key's presence/format purely through the UI, exactly as the
original: `toHaveValue(/mb_/)` on the "The API key" input and `getByText(/mb_/)`
on the masked table prefix. The unmasked value returned by
`createApiKey`/`POST /api/api-key` is passed only into the X-Api-Key request
helpers (to create/edit content as the key, mirroring the original) and is
**never logged or echoed** anywhere in the helper or spec.

## Port decisions worth noting

- **`getGroups` intercept dropped (rule 2).** The Cypress `beforeEach` registers
  `GET /api/permissions/group` as `@getGroups` but never `cy.wait`s it — dropped,
  noted in the spec header.
- **Mantine "hidden dropdown" workaround → `includeHidden: true`.** The Cypress
  `tryToCreateApiKeyViaModal` picks the group option with testing-library's
  `hidden: true` (a documented Mantine bug marks the Select dropdown aria-hidden
  while the create Modal is open). Ported as
  `getByRole("listbox"/"option", { includeHidden: true })`. aria-hidden doesn't
  affect Playwright actionability (the element is still CSS-visible), so the
  click lands fine. Note the asymmetry the original also has: the **edit** form's
  dropdown is NOT hidden, so that path uses a plain `getByRole("listbox")` with
  no includeHidden — ported literally.
- **X-Api-Key requests run through the isolated `APIRequestContext`** with only
  the `X-Api-Key` header (no session). Playwright's `request` fixture doesn't
  share the browser's cookies, so this is inherently authenticated purely by the
  key — the Cypress `cy.signOut()` before each keyed request is unnecessary here
  and was omitted (the `mb.signInAsAdmin()` before each verify visit is kept).
- **`.closest('[role="row"]')` → `getByRole("row").filter({ has: page.getByText(name, {exact}) })`**
  building the `has` sub-locator from `page`, not from the table Locator (INDEX
  gotcha: `has` re-anchors to the outer scope when built from a Locator).
- **Group ids** are the fixed `default`-snapshot values (ADMIN 2, ALL_USERS 1,
  READONLY 7, NOSQL 8), defined locally in `support/api-keys.ts` mirroring
  USER_GROUPS — same pattern as `create-queries.ts`/`click-behavior.ts`.

## Dividends

None — clean faithful port, no Cypress-masked issues surfaced.
