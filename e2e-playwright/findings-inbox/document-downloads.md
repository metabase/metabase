# document-downloads.spec.ts

Port of `e2e/test/scenarios/documents/document-downloads.cy.spec.ts`
(4 tests). Verified on the jar (slot 3): 4/4 green, 8/8 under
`--repeat-each=2`, tsc clean.

Covers the download menu on cards embedded in a document view: the embedded
card's ellipsis menu, its "Download results" item (presence + enabled state
per permission level), and the .csv/.xlsx/.json format options. These assert
menu state, not an actual file download — no `waitForEvent("download")`
needed.

EE feature (documents); test 4 additionally activates `pro-self-hosted` for
the download-permission graph (the jar provides the token) and skips when the
token is unavailable (rule 7). No issue numbers in the source.

## No new helper module

Everything was reusable read-only, so no `support/document-downloads.ts` was
created:
- `createDocument` / `visitDocument` / `getDocumentCard` /
  `openDocumentCardMenu` / `documentContent` (documents-core.ts)
- `DOCUMENT_WITH_TWO_CARDS` (card-embed-node.ts — inlined there because the
  Cypress fixture module resolves through the `e2e/*` path alias)
- `updatePermissionsGraph` (dashboard-repros.ts)
- `popover` (ui.ts), `resolveToken` (api.ts), `SAMPLE_DB_ID`/`UserName`
  (sample-data.ts)

`ALL_USERS_GROUP`/`READONLY_GROUP` (1/7) defined as spec-local consts, same as
download-permissions.spec.ts.

## Fixes / classification (all mechanical, no product bugs)

- `H.createDocument({alias, idAlias})` + `H.visitDocument("@documentId")` →
  awaited `createDocument(...)` returning `{id}`, then `visitDocument(page,
  doc.id)`. Cypress aliasing has no Playwright analogue. Known gotcha.
- `.findByTestId("table-root").should("exist")` → `toBeAttached()` (existence,
  not visibility). Known gotcha.
- `cy.signIn("nocollection")` → `mb.signIn("nocollection" as UserName)` — the
  user has a cached session but isn't in the USERS credential map (widening
  cast, same as documents.spec.ts). Known gotcha.
- `H.documentContent().should("not.exist")` /
  `cy.findByRole("button",{name:/ellipsis/}).should("not.exist")` →
  `toHaveCount(0)`.
- Test 1's per-item `findAllByRole("menuitem").each(...)` with
  `should("be.disabled"/"not.be.disabled")` is a genuine per-element assertion
  (NOT the any-of-set case in rule 3) → ported as a per-item loop over
  `menu.getByRole("menuitem").nth(i)`, checking `textContent()` and asserting
  `toBeEnabled()`/`toBeDisabled()`. Mirrors the working pattern in
  documents.spec.ts ("read only access"). No dividend: this spec's per-item
  form already asserted the right thing upstream (unlike documents.cy's blanket
  `.should("be.disabled")`, which was the masked-assertion dividend recorded on
  that port).

No dividends flagged.
