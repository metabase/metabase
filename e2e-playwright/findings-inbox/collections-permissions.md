# collections-permissions (collections/permissions.cy.spec.js)

Ported to `tests/collections-permissions.spec.ts`. 24 tests defined; verified on
the CI EE uberjar (slot 5), 47/47 across `--repeat-each=2` green (23 pass + 1
skip per run). No `test.fixme`, no product-bug claims — so no Cypress
cross-check needed.

## Port shape
- Cypress iterates a `PERMISSIONS` map through `onlyOn`; only the `curate` group
  (admin/normal/nodata) and the `view` group (readonly) produce runnable tests.
  The `no` group (nocollection/nosql/none) has no matching `onlyOn`, so nothing
  runs for those users. Ported as two explicit user lists.
- `nodata` correctly skips the "archive/unarchive model" test (`cy.skipOn` →
  `test.skip`) — it can't create a native model. Shows as the 1 skip per run.
- EE gate: only "should load the collection permissions admin pages" needs the
  `pro-self-hosted` token (`H.activateToken`). Gated with `resolveToken`
  (PORTING rule 7). The jar activates it, so it runs.
- `cy.signIn("nocollection")` / `signIn` inside the loops use `as UserName` —
  those users live in the login cache but not the typed USERS map.

## New gotcha (fed back to PORTING.md) — entity-picker search debounce + Enter
The #15281 test runs twice ("/" and "/collection/root"; ported with the route
in the title, since Playwright rejects duplicate titles). Its second step drives
the "Select a collection" picker's search. Cypress typed `"third{Enter}"` then
`cy.wait("@search")`.

The picker is the new **`CollectionPickerModal`** (EntityPicker), whose
`SearchInput` **debounces 300ms** before firing `GET /api/search`
(`EntityPickerModal.tsx:228`). Porting the `{Enter}` as a real
`keyboard.press("Enter")` right after typing **submits the underlying
create-dashboard form and unmounts the picker before the 300ms debounce fires**
— the debounced callback is cancelled, no `/api/search` is ever sent, and
`waitForResponse` burns its full timeout. The failure snapshot shows the app on
the home page with no modal, which reads like an unrelated navigation.

Fix: register the `/api/search` wait, type the query, and let the debounce fire
— the `Enter` is not needed to trigger the search and only races the assertion.
Drop it. General rule: **the entity-picker search box is debounced; never press
Enter to "commit" it — register the search wait, type, await.**

## New helpers
`support/collections-permissions.ts` (new file per rule 9): `clickButton`,
`pinItem`, `move`, `duplicate`, `archiveUnarchive`, `collectionRow`,
`personalCollectionName` / `USER_FULL_NAMES`, `waitForCollectionGraph`,
`waitForPermissionsGroups`. `exposeChildrenFor` was NOT re-ported — it's
behaviourally identical to the shared `displaySidebarChildOf` (both click the
top-level sidebar chevron), which the spec already uses.

## Consolidation candidate (already flagged in PORTING)
`USER_FULL_NAMES` here overlaps the "shared USERS name map" PORTING lists as a
later consolidation candidate (sample-data.ts carries only email/password).
