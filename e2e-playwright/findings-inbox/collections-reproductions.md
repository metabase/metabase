# collections-reproductions

Port of `e2e/test/scenarios/collections/collections-reproductions.cy.spec.ts`
→ `tests/collections-reproductions.spec.ts`. 6 tests across 6 issue-numbered
describes (20911, 24660, 30235, 58231, 56567 ×2).

Verified on the CI EE uberjar (COMMIT-ID 751c2a98), slot 2: 6/6 green, 12/12
under `--repeat-each=2`. tsc clean.

## Result

Faithful port, no fixmes, no product-bug claims — so no Cypress cross-check was
needed. Every UI helper the spec touches already existed in shared modules; the
only net-new code is one derived constant.

## Fixes / adaptations (all mechanical, all covered by existing gotchas)

- `H.createCollection` → `createCollectionViaApi` (collections-cleanup.ts);
  `cy.request("PUT", "/api/card/:id", …)` → `mb.api.put` (PORTING rule 2 / api
  client mirrors cy.request).
- `cy.intercept + cy.wait("@getGraph"/"@savePermissions")` → `page.waitForResponse`
  registered before the trigger, matched on pathname + method (rule 2). The
  `?skip-graph=true` query is matched by pathname only.
- `cy.realType("{esc}")` on the entity-picker modal → `page.keyboard.press("Escape")`
  followed by `toHaveCount(0)` to gate the next interaction (mini-picker open).
- `findByText`/`findByLabelText` string args → `{ exact: true }` (rule 1),
  including the two curly-vs-straight apostrophe error strings in #20911
  ("You don't…" straight vs "Sorry, you don't…" curly — preserved verbatim).
- `metabase-types/api` `CollectionId` import is outside the spike tsconfig →
  local `type CollectionId = number` alias (same pattern as column-compare).

## New helper

- `support/collections-reproductions.ts` exports only `ORDERS_COUNT_QUESTION_ID`,
  derived by question name from `cypress_sample_instance_data.json` the same way
  sample-data.ts derives `ORDERS_QUESTION_ID` (sample-data.ts doesn't export the
  Count id).

## Dividend / consolidation flag

- `ORDERS_COUNT_QUESTION_ID` is now re-derived in **8+** support modules
  (dashboard-card-fetching, dashboard-tabs, organization, question-management,
  search-filters, supporting-text, card-embed-node, and now
  collections-reproductions). Strong candidate to promote into `sample-data.ts`
  alongside `ORDERS_QUESTION_ID` in a consolidation pass. `ADMIN_PERSONAL_COLLECTION_ID`
  is similarly duplicated across permissions.ts / dashboard-tabs.ts / search-filters.ts.
