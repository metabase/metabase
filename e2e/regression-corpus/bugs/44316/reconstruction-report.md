Reconstruction succeeded — this is a **kill**. The diff is left in the worktree.

## 1. git diff (semantic revert)
```diff
--- a/frontend/src/metabase/common/components/Pickers/EntityPicker/hooks/use-get-path-from-value.ts
+++ b/frontend/src/metabase/common/components/Pickers/EntityPicker/hooks/use-get-path-from-value.ts
@@ getCollectionPathFromValue
   const location = PLUGIN_LIBRARY.isLibraryCollectionType(collection?.type)
     ? collection?.location
-    : (collection?.effective_location ?? collection?.location);
+    : collection?.location;
```
The original fix (#44327) changed `location: currentCollection.location` → `currentCollection.effective_location` in `CollectionPicker.tsx`/`DashboardPicker.tsx`'s `getCollectionIdPath` call. All five originally-shipped files are gone (class `all_specs_gone` confirmed) — the pickers were refactored into `Pickers/` and the initial-path logic was extracted into the `useGetPathFromValue` hook. The descendant of that exact logic is the `location = effective_location ?? location` expression above; my mutation drops the `effective_location` preference, reintroducing the bug.

## 2. Oracle
- Spec: `frontend/src/metabase/common/components/Pickers/EntityPicker/hooks/use-get-path-from-value.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs <spec> -t "collection item paths"`
- Baseline (clean HEAD): PASS (Tests: 1 passed, targeted test).
- Reconstructed (mutation applied): **Tests: 1 failed, 6 passed** in the block.

## 3. failure_shape
- Failing test: `useGetPathFromValue › collection item paths › should use effective_location for collection path`
- Assertion mismatch: `expect(path).toHaveLength(3)` — **Expected length: 3, Received length: 4**. The grandchild collection (id 36) has `location: "/16/26/"` but `effective_location: "/16/"`. Correct behavior skips the inaccessible middle collection (id 26) → path `[root, 16, 36]` (len 3). With the bug it walks the raw `location`, inserting collection 26 → `[root, 16, 26, 36]` (len 4).

## 4. Confidence + adversarial
High confidence the failure isolates the reverted behavior. The sibling control test in the same block — `should return path for a nested collection in normal namespace` — uses a collection where `location === effective_location`, so it stays **green** under the mutation (it's in the 6 passed). Only the test whose fixture makes `effective_location` diverge from `location` flips. It's a clean value assertion (length 3 vs 4 via `waitFor`), not a compile/import error; the module compiled and 6 sibling tests ran normally.

## 5. Outcome
**kill** (oracle relocated: shipped `CollectionPicker.unit.spec.tsx`/`DashboardPicker.unit.spec.tsx` → co-located hook spec `use-get-path-from-value.unit.spec.tsx`, with the product logic module-extracted into the `useGetPathFromValue` hook). The regression is caught by a surviving jest unit test with no need for a new one. Note: the `Pickers/utils.ts` `isItemInCollectionOrItsDescendants` path also carries the `effective_location ?? location` idiom, but its spec sets the two fields equal in the relevant cases, so it is non-discriminating for this bug; the hook spec is the true oracle.