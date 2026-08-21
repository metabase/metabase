# document-permissions

Port of `e2e/test/scenarios/documents/document-permissions.cy.spec.ts` →
`tests/document-permissions.spec.ts` (2 tests). New helper module
`support/document-permissions.ts`.

Verified on the jar (slot 3, COMMIT-ID 751c2a98): 2/2 green, 4/4 under
`--repeat-each=2`. tsc clean for the new files.

## Fixes / classifications

All mechanical, all known gotchas — nothing needed a cross-check and no
product bug surfaced.

- **snowplow → stub (rule 6).** `resetSnowplow` and
  `expectUnstructuredSnowplowEvent` are no-op stubs; the sole snowplow
  assertion (`document_created`) becomes a no-op. Matches the documents.spec
  precedent.
- **`cy.signIn("none")` — cached-session user (rule from Environment facts).**
  The "none" user (no collection perms) lives in the snapshot login cache but
  not the harness `USERS` credential map, so `mb.signIn("none" as UserName)`
  resolves it through the cache. Same `as UserName` cast the documents.spec
  used for "nocollection".
- **`cy.updateCollectionGraph` — API setup (collection-permissions via API).**
  Re-exported the existing shared `updateCollectionGraph` (click-behavior.ts)
  through the new module rather than duplicating it. `ALL_USERS_GROUP` is the
  fixed id `1` from `cypress_data.js`.
- **`cy.location(...).should("match", ...)` → `expect.poll` (rule: retried
  hash/URL assertions).**
- **`findByText(...).should("not.exist")` → `toHaveCount(0)`; `.should("exist")`
  → `toBeAttached()`; `findByRole` string names → `{ exact: true }` (rule 1).**
- **`H.documentContent().type(...)` → click + `addToDocument(..., false)`.**
  The Cypress `.type()` focuses the editor first; ported as an explicit
  `documentContent(page).click()` before typing (documents.spec pattern).

## Dividends

None. Faithful 1:1 port; both behaviours (non-admin create-into-personal-
collection, non-admin edit-own-document) reproduce cleanly on the jar.
