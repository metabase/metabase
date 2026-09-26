# Reconstruction report — metabase#67680

_Verbatim final report from the worktree-isolated reconstruction agent (a31398cab9a1b344d)._

---

The reconstruction is clean and complete. Here is the report.

## 1. Reconstruction (unified diff)

```diff
diff --git a/src/metabase/lib/card.cljc b/src/metabase/lib/card.cljc
--- a/src/metabase/lib/card.cljc
+++ b/src/metabase/lib/card.cljc
   Returns `:id` for native models only."
-  [native-model? :- :boolean]
-  (cond-> [:description :display-name :semantic-type :fk-target-field-id :settings :visibility-type :lib/source-display-name]
-    native-model? (conj :id)))
+  [_native-model? :- :boolean]
+  [:id :description :display-name :semantic-type :fk-target-field-id :settings :visibility-type :lib/source-display-name])
```

Single-file, single-function change. `model-preserved-keys` now returns `:id` unconditionally (ignoring `native-model?`), exactly matching the pre-fix static `def` that always contained `:id`. The `native-model?` parameter is threaded through by all callers untouched — I keep the arity/schema intact (renamed to `_native-model?`) so the entire call chain (`merge-model-metadata` → `result_metadata.cljc` → `fetch_source_query.clj`) still compiles and dispatches; the value is simply no longer consulted, which is the semantic essence of the bug.

## 2. Oracles / results

- Namespaces: `metabase.lib.card-test/source-model-card-test` and `metabase.lib.metadata.result-metadata-test/model-metadata-id-preservation-test`
- Baseline (unmodified worktree): 2 tests, 5 assertions, 0 failures → PASS
- Reconstructed: 2 tests, 5 assertions, 1 failure, 0 errors → FAIL as a clean test-assertion failure (code loads fine)
  - Failing assertion: `model-metadata-id-preservation-test`, sub-test "MBQL query: stale :id from model metadata should be ignored" (result_metadata_test.cljc:992) — `expected: 44400` (VENUES.ID from query analysis) `actual: 44600` (ORDERS.ID — the stale id injected via `:metadata/model-metadata`).
  - The native-query sub-test still passes (native models legitimately preserve `:id`), and `source-model-card-test` still passes (it asserts only `:display-name`/`:description`, which are preserved regardless of `native-model?`).

## 3. failure_shape

- symptom: For a model whose stored `result_metadata` carries stale `:id` values (e.g. the model's source table was swapped), an MBQL query over that model surfaces columns whose `:id` points at the *old* field/table instead of the id derived from live query analysis. Downstream, field references, drill-throughs, and FK linkages resolve to the wrong field.
- repro_failure: `metabase.lib.metadata.result-metadata-test/model-metadata-id-preservation-test` — "MBQL models should use :id from query analysis, not stale model metadata" — `expected: 44400, actual: 44600`.

## 4. Confidence + adversarial reasoning

Confidence: very high that this is the actual historical bug.

- The fix commit is literally titled "Allow to overwrite id only for native models," and its central diff converts `model-preserved-keys` from a static vector containing `:id` into a `native-model?`-gated function. My reconstruction restores precisely that static-vector-with-`:id` behavior. This is the exact pre-fix state, not merely *a* change that happens to trip the test.
- The failing assertion is the one tagged `(#67680)` in the test and its failure mode is the canonical bug signature: the MBQL result column takes the stale model-metadata id (ORDERS.ID = 44600) instead of the query-analyzed id (VENUES.ID = 44400). That is the observable regression the issue describes.
- The other three files in the fix (`result_metadata.cljc`, `fetch_source_query.clj`) exist only to *compute and plumb* the `native-model?` flag so the gate in `model-preserved-keys` can act on it. With the gate removed, that plumbing becomes inert — reverting it too would be redundant and would risk load/compile errors from arity mismatches. Leaving the plumbing intact but neutering the decision point is the minimal, faithful semantic undo, and it correctly leaves the native-query assertion passing (native models still get `:id`, because unconditional preservation is a superset that happens to coincide with correct behavior in the native case).

One candid caveat: because the reconstruction makes `:id` *unconditional* rather than reproducing any subtler original selection logic, it is theoretically possible the true historical code differed in some detail beyond the `:id` gate. But the fix diff shows the pre-fix `model-preserved-keys` was exactly `[:id :description :display-name :semantic-type :fk-target-field-id :settings :visibility-type :lib/source-display-name]` — identical to what I restored — so there is no residual ambiguity here.

## 5. Ambiguity

None material. The fix spanned 3 product files but the behavioral decision lives entirely in `model-preserved-keys`; the other two files are flag-plumbing. The reconstruction is minimal (one function), loads cleanly, and flips exactly the intended oracle assertion while leaving the native-model and display-name/description behaviors correct.

Relevant file: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a31398cab9a1b344d/src/metabase/lib/card.cljc` (function `model-preserved-keys`, ~line 211).
