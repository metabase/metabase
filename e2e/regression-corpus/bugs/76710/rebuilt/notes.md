# 76710: table with a foreign key to an inaccessible table fails to load

Status: live. Base `8317274709c`. Oracle: the fix's own spec on master.

## Where the code moved
The fix, 8e47d62c2c7 (#76740, "Don't error when table has a foreign key reference to an inaccessible table"), changed one line in `frontend/src/metabase/redux/tables.ts`: in `fetchTableMetadataAndForeignKeys`, `Promise.all` became `Promise.allSettled`. The file hasn't moved. #82163 ("Read table foreign keys from the store, not the metadata wrapper") rewrote the thunk to read fields from the store instead of `getMetadataUnfiltered(...).table(id)`. It now fetches the tables that foreign keys point to (`getForeignKeyTableIds`) and target fields missing from the store via `fieldApi.getField` (`getMissingTargetFieldIds`). That rewrite is why July's reverse patch conflicts. The `allSettled` is at line 80 and now covers both fetches.

## Mutant
Line 80 goes from `await Promise.allSettled([` back to `await Promise.all([`, the shipped fix reversed. `runRtkEndpoint` calls `.unwrap()`, so a 403 on `GET /api/field/:id` rejects. With `Promise.all` that rejection escapes the thunk, and the user gets a permission error instead of the table.

## Oracle
`frontend/src/metabase/redux/tables.unit.spec.ts::fetchTableMetadataAndForeignKeys resolves and loads the table even when a foreign key target field is forbidden`. Clean HEAD: both tests pass. Mutant, first failure: `expect(received).resolves.toBeUndefined()  Received promise rejected instead of resolved  Rejected to value: {"data": "You don't have permissions to do that.", "status": 403}`.

## Adversarial check
The test's first assertion, and the rejection value is the mocked 403 body. Nothing renders, no crash or timeout. The other test in the file (a reachable foreign key target) still passes on the mutant. The deleted e2e test hits the same path: it waits for `GET /api/field/<PRODUCTS.ID>` to return 403, then expects the Orders table to render.

## Variants
- variant-1: removes the fetch of target fields missing from the store. **Kill** (`called(/api/field/3)` expected true, got false).
- variant-2: inverts the filter in `getMissingTargetFieldIds` (`== null` to `!= null`). **Kill**; the other test fails too.
- variant-3: half fix, target-table fetches use `Promise.all` and only target-field fetches are settled. **Survive**.

## Things that would trip the next person
- Test gap: variant 3 surviving shows no unit test covers a forbidden target table whose field is already in the store.
- Variant 1 leaves `fieldApi` and `getMissingTargetFieldIds` unused: fails lint, not jest.
- The backend test `query-runs-when-fk-target-table-blocked-test` doesn't cover this frontend mutant.
- No `.cljc` touched. Jest about 26 s cold, 4 s warm.
