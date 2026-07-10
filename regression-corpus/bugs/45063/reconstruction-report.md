# Reconstruction report — metabase#45063

_Verbatim final report from the worktree-isolated reconstruction agent (af16b09b6e9d683e5)._

---

Reconstruction succeeded. Report below.

## 1. `git diff`

```diff
diff --git a/src/metabase/warehouse_schema/table.clj b/src/metabase/warehouse_schema/table.clj
@@ -46,7 +46,7 @@
   (if include-editable-data-model?
     (api/write-check table)
     (api/check-403 (can-access-table-for-query-metadata? table)))
-  (let [hydration-keys (cond-> [:db [:fields [:target :has_field_values] :has_field_values :dimensions :name_field]
+  (let [hydration-keys (cond-> [:db [:fields [:target :has_field_values] :has_field_values :dimensions]
                                 [:segments :definition_description] [:measures :definition_description] :metrics :collection]
                          (premium-features/any-transforms-enabled?) (conj :transform))]
```

Note on localization: the product file `src/metabase/api/table.clj` from the fix commit has since been modularized. The `table/:id/query_metadata` endpoint logic now lives in `src/metabase/warehouse_schema/table.clj`, function `fetch-query-metadata*` (reached via `defendpoint :get "/:id/query_metadata"` → `fetch-table-query-metadata` → `fetch-query-metadata*`). The fix's `:name_field` addition survived the refactor there. Minimal semantic revert = drop the single `:name_field` hydration key (matching the pre-fix hydration spec), leaving `:dimensions`/`:has_field_values`/`:target` intact.

## 2. Oracle ns / name + baselines

- Oracle ns: `metabase.warehouse-schema-rest.api.table-test` (file `test/metabase/warehouse_schema_rest/api/table_test.clj`)
- Deftests (both discriminate; both are modified existing deftests with fix-added `:name_field` assertions): `sensitive-fields-included-test` (line 246) and `sensitive-fields-not-included-test` (line 329)
- Baseline (unmodified worktree, run individually): both PASS — 2 assertions, 0 failures, 0 errors each
- Reconstructed (after revert, run individually): both FAIL — 2 assertions, **1 failure, 0 errors** each

Flake note: running the two `^:parallel` deftests together at baseline produced a spurious 1 error (unrelated to reconstruction); each passes cleanly when run alone, so I validated individually.

## 3. failure_shape

Clean assertion failure (`FAIL in ...`, not error/exception). The `diff:` block shows the actual response's field maps missing the fix-added keys: `- {:fields [{:name_field {...populated type/Name map for the PK field...}} {:name_field nil} {:name_field nil} ...]}`. Exactly the assertions the fix added.

## 4. Confidence + adversarial reasoning

Confidence: **high**.
- The failure is a genuine assertion failure (1 failure, 0 errors), with expected/actual/diff — not a compile break or thrown exception.
- The diff delta is precisely and only the `:name_field` keys the fix commit added to these two deftests (populated map for the PK/id field, `nil` for the others). No collateral differences.
- The revert is minimal and semantic: one hydration key removed, restoring the pre-fix hydration spec. `format-fields-for-response`/`present-table` do not re-derive `:name_field` independently — confirmed by the key being wholly absent from the actual response.
- I deliberately left the sibling batch path (`batch-fetch-query-metadatas*`, line 74) untouched; neither oracle test exercises it, so minimality favors touching only the driving code path.

## 5. Ambiguity

None material. The only wrinkle is the parallel-run flake, handled by running each deftest in isolation. No `reconstruction_failed` — a valid backend oracle exists and fails as intended.
