# public-documents.spec.ts

Port of `e2e/test/scenarios/documents/public-documents.cy.spec.ts`
("scenarios > documents > public"). 11 tests, all green on the jar (slot 2),
12/12 → 22/22 under `--repeat-each=2`. tsc clean.

## Result

Faithful port, no fixmes, no product-bug claims — no cross-check needed. New
helper module `support/public-documents.ts` (createPublicDocumentLink,
visitPublicDocument, verify{DocumentIsReadOnly,CommentsAreHidden,ErrorMessage}).
All node/card/menu getters imported read-only from documents.ts /
documents-core.ts / ui.ts.

## Fixes / notes (classified per feedback-loop rule)

- **Known gotcha applied (not a fix):** the document public-link endpoint is
  `POST /api/document/:id/public-link` (**dash**), unlike card/dashboard/action
  which use `.../public_link` (underscore). So it could NOT reuse
  `support/public-sharing.ts createPublicLink` — new helper.
- **Known gotcha applied:** `H.Comments.getDocumentNodeButtons().should("exist")`
  is a DOM-presence check on opacity-hidden portals → ported as
  `.first().toBeAttached()` (not `toBeVisible`), dodging strict mode.
- **Known gotcha applied:** `cy.contains(msg)` in `verifyErrorMessage` is a
  case-sensitive substring that can match twice (error title + body) → substring
  regex + `.first()`.

No FINDINGS-worthy dividends: no Cypress-masked bug, no strengthened assertion,
no environmental surprise. The premium-footer test needed only a per-test token
gate (mirrors documents.spec.ts).

## Consolidation candidate (flag only)

`createPublicDocumentLink` (this module) vs `createPublicLink`
(public-sharing.ts) — same shape, different endpoint slug. Could fold into one
`createPublicLink(api, type, id)` where `type: "document"` maps to the dash
variant. Left separate to honour "new module per agent; do not edit shared
files" — a later consolidation pass could unify.
