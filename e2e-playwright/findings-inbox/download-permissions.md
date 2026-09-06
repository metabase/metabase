# download-permissions.spec.ts

Port of `e2e/test/scenarios/permissions/download-permissions.cy.spec.js`
(7 tests). Verified on the jar (slot 3): 7/7 green, 14/14 under
`--repeat-each=2`, tsc clean (the only tsc errors are pre-existing in
`collections-reproductions.spec.ts` — `CollectionId` unresolved — unrelated to
this port).

EE-gated on `pro-self-hosted` (download permission levels are an EE feature;
the jar activates the token). Issue number preserved: metabase#22408.

## New helpers → support/download-permissions.ts (new file, no shared edits)

- `sidebar` — H.sidebar (`cy.get("main aside")`); no prior admin-permissions
  port needed it.
- `assertPermissionForItem` — the single-row-cell assertion from
  e2e-permissions-helpers.js (the create-queries port only needed the
  whole-table `assertPermissionTable`).
- `setDownloadPermissionsForProductsTable` — spec-local; grants All Users the
  given download level on Products only, every other sample table `full`.
- `DATA_ACCESS_PERMISSION_INDEX` / `DOWNLOAD_PERMISSION_INDEX` constants.

Everything else imported read-only: `modifyPermission` (admin-permissions.ts,
full upstream signature), `updatePermissionsGraph` (dashboard-repros.ts),
`downloadAndAssert` (downloads.ts), `createNativeQuestion` (factories.ts),
`icon`/`modal`/`popover`/`visitQuestion`/`visitDashboard` (ui.ts), table/db
constants (sample-data.ts).

## Fixes / classification (all mechanical, no product bugs)

- `cy.wait("@dataset")` after "Explore results" → a POST `/api/dataset`
  `waitForResponse` registered before the click (rule 2). Known gotcha.
- `cy.button("Save changes")` + modal confirm → shared confirm helper anchored
  on the `[role=dialog][aria-modal]` inner dialog, asserting it disappears
  after Yes (Modal-root toBeVisible-reads-hidden gotcha). Known gotcha.
- `H.sidebar().contains("Orders")` → case-sensitive substring, first match →
  `getByText(/Orders/).first()` (rule 3 / cy.contains semantics). Known gotcha.
- `cy.get("@nativeQuestionId")` alias → module-scoped `let` set in the inner
  describe's beforeEach.

## Dividend flagged (migration dividend, real downloads)

The four download tests exercise the real export end-to-end: the browser
download lands as a file and `downloadAndAssert` parses the sheet with the
`xlsx` lib — strictly stronger than the Cypress intercept-and-redirect, which
never let the file complete. The `limited`/`full` levels and the
single-table-`none`/`limited` propagation to native questions + ad-hoc nested
queries + native models are all verified against genuinely-downloaded files.

Note: the `xlsx` lib prints `Bad uncompressed size: N != 0` to stderr while
parsing the jar's exports; these are non-fatal (rows parse correctly, all
row-count/content assertions pass) and already surface in other download ports.

## Cross-check

Not needed: no test.fixme, no product-bug claim — every test passes faithfully
on the jar.
