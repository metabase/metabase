# data-model-permissions

Port of `e2e/test/scenarios/permissions/data-model-permissions.cy.spec.js`
→ `tests/data-model-permissions.spec.ts` (3 tests).

## Result
3/3 green on the jar (slot 1, COMMIT-ID 751c2a98), 6/6 under `--repeat-each=2`.
tsc clean. No fixmes, no product-bug claims — no cross-check needed.

## Helpers
New file `support/data-model-permissions.ts` with only:
- `savePermissionsGraph` — spec-local save-and-confirm on the data-permissions page.
- `waitForTableMetadata` — GET `/api/table/:id/query_metadata` wait (the
  `@tableMetadataFetch` alias). data-model.ts keeps the equivalent predicate
  private, hence re-derived here.

Everything else reused read-only: `modifyPermission` (admin-permissions.ts),
`assertPermissionForItem` (download-permissions.ts), the DataModel/TablePicker/
TableSection/FieldSection surface + `visitDataModel` + `waitForTableUpdate` +
`SAMPLE_DB_SCHEMA_ID` (data-model.ts), `goToAdmin` (command-palette.ts),
`signInWithCachedSession` (permissions.ts), `undoToast` (metrics.ts),
`modal` (ui.ts).

## Fixes classified (all known gotchas — brief was accurate)
- Rule 2: `@tableMetadataFetch`/`@tableUpdate` → `waitForResponse` registered
  before the click/blur.
- EditableText name input: `fill()` doesn't mark dirty; clear via
  click + `ControlOrMeta+A` + Backspace, type with `pressSequentially`, commit
  on blur.
- `cy.signIn("none")` → `signInWithCachedSession(page.context(), "none")` — the
  "none" user is outside the mb fixture's typed USERS map. Only browser cookies
  are switched; test #3 only navigates, so that's sufficient.
- Toast gotcha: `undoToast().first()` for the "Table name updated" assertion.
- Hide/Unhide table buttons are hover-gated ActionIcons in the TablePicker row —
  `hover()` the row before clicking (rule 4).

## Dividends
None. No Cypress-masked issues found; the port is a faithful 1:1.

## Consolidation note (later pass)
`savePermissionsGraph` here is byte-identical to the spec-local
`saveAndConfirmPermissions` in `download-permissions.spec.ts` (both: click
"Save changes", assert the "Save permissions?" / "Are you sure…" modal, click
"Yes", assert modal gone). Candidate to promote to a shared permissions helper.
