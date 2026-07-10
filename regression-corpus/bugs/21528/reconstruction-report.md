# Reconstruction report — metabase#21528

_Verbatim final report from the worktree-isolated reconstruction agent (ae8a4accda63b8e7d)._

---

The reconstruction reproduces the exact historical bug as a clean assertion failure. Done.

## Report

### 1. Reconstruction `git diff`

File (moved from `src/metabase/models/params/chain_filter.clj` → current location): `src/metabase/parameters/chain_filter.clj`

```diff
@@ chain-filter @@
-      (and (use-cached-field-values? field-id) (nil? @remapping))
+      (use-cached-field-values? field-id)
       (do
         (check-field-value-query-permissions field-id constraints options)
         (cached-field-values field-id constraints options))

@@ chain-filter-search @@
-      (and (search-cached-field-values? field-id constraints) (nil? @the-remapped-field-id))
+      (search-cached-field-values? field-id constraints)
       (do
         (check-field-value-query-permissions field-id constraints options)
         (cached-field-values-search field-id query-string constraints options))
```

This is the semantic inverse of the fix's core change. The fix (524ed31) restructured nested `if`s into a `cond` and, critically, added the `(nil? @the-remapped-field-id)` guard so the cached-FieldValues branch only fires when the field is *not* Field→Field remapped. Removing that guard restores the pre-fix behavior: cached FieldValues short-circuit the remapping branch. The other part of the fix (`mdb.query/query` → `t2/query-one` in `remapped-field-id`) was cosmetic refactoring and already fully superseded by current code, so it is not touched.

### 2. Oracle + results

- Namespace/test: `metabase.parameters.chain-filter-test/use-cached-field-values-for-remapped-field-test` (`test/metabase/parameters/chain_filter_test.clj:867`)
- Baseline (clean HEAD): **PASS** — 2 assertions, 0 failures, 0 errors.
- Reconstructed: **FAIL** — 2 assertions, 1 failure, 0 errors. Loaded and ran fine (assertion failure, not compile/load error). The failing assertion is the `chain-filter` call at line 872.

### 3. Failure shape

- symptom: Fetching values for a field that has cached FieldValues (`has_field_values "list"`) AND a Field→Field remapping (`venues.category_id` → `categories.name`) returns bare unremapped values instead of `[value remapped-value]` tuples.
- repro_failure:
  ```
  expected: {:values [[2 "American"] [3 "Artisan"] [4 "Asian"]], :has_more_values false}
    actual: {:values ([2] [3] [4]), :has_more_values false}
  ```
  The `([2] [3] [4])` are raw cached `category_id` values returned by `cached-field-values`, with no remapped `categories.name` second element — exactly the #21528 report.

### 4. Confidence + adversarial reasoning

Confidence: **very high**. This is the actual historical bug, not an incidental trip:
- The removed clause is verbatim the exact guard the fix commit added; my edit is its precise semantic negation.
- The test docstring cites "#21528" and the produced `actual` value is the canonical symptom (cached ids, no remapped names).
- It is a genuine assertion failure on a query-result value, not a load/compile error or an unrelated exception.
- The failure is causally located in the branch I edited: `use-cached-field-values? field-id` is now true (the field has `has_field_values "list"`), so the `cond` selects `cached-field-values` and never reaches the `(some? @remapping)` remapping branch below it — the identical ordering defect the fix eliminated.

Note: only the `chain-filter` guard removal independently trips this oracle. The second assertion (`chain-filter-search`, line 877) still passes because `search-cached-field-values?` returns false for this query-string search case, so its cached branch isn't taken regardless. I still reconstructed the search guard removal because the fix commit changed both functions symmetrically — keeping the reconstruction faithful to the historical bug's full surface — but it is the `chain-filter` change that satisfies the oracle.

### 5. Ambiguity

None material. The only judgment call was whether to touch the search branch; I mirrored the fix on both for faithfulness while confirming the values branch is the one the oracle exercises. Reconstruction is clean and minimal.
