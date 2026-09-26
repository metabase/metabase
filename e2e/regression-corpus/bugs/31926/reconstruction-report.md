# Reconstruction report — metabase#31926

_Verbatim final report from the worktree-isolated reconstruction agent (a4c8055ca5bff7832)._

---

Reconstruction complete and proven. Here is the report.

## 1. Reconstruction `git diff`

```diff
diff --git a/src/metabase/lib/native.cljc b/src/metabase/lib/native.cljc
@@ -217,10 +217,8 @@
    metadata-provider :- ::lib.schema.metadata/metadata-providerable]
   (assert-native-stage (lib.util/query-stage query 0))
-  (let [stages-without-fields (->> (:stages query)
-                                   (mapv (fn [stage]
-                                           (update stage :template-tags update-vals #(dissoc % :dimension)))))]
-    (lib.query/query-with-stages metadata-provider stages-without-fields)))
+  ;; Changing the database should also clean up template tags, see #31926
+  (lib.query/query-with-stages metadata-provider (:stages query)))
```

File: `/Users/fraser/Documents/code/metabase/src/metabase/lib/native.cljc` (`with-different-database`, ~line 214).

This is a semantic revert, not `git apply -R`: I preserved the drifted assertion name (`assert-native-stage`, formerly `assert-native-query!`) and touched only the body, restoring the pre-fix behavior of passing `(:stages query)` straight through instead of stripping `:dimension` from each template tag.

## 2. Oracle

- **Namespace/name:** `metabase.lib.native-test/remove-template-tags-when-changing-database` (`test/metabase/lib/native_test.cljc:520`)
- **Baseline (current fixed code):** PASS — `1 assertion, 0 failures, 0 errors`
- **Reconstructed (bug reintroduced):** FAIL — `1 assertion, 1 failure, 0 errors`
  - The single assertion `(is (empty? ... (filter :dimension)))` fails; `actual` shows the surviving template tag still carrying its `:dimension [:field {…} 1]`.

## 3. Failure shape

- **symptom:** After `lib/with-different-database`, native-query field-filter template tags retain their `:dimension` field reference pointing at the old database's fields. Stale dimensions are not cleaned up on DB change (the #31926 bug).
- **repro_failure:** Assertion failure in `remove-template-tags-when-changing-database` — `expected (empty? …)` but `(filter :dimension)` returns the `mytag` field-filter with `:dimension` intact.

## 4. Confidence + adversarial reasoning

**Confidence: high.**

- The failure is a true assertion failure, not a load/compile error: `0 errors`, the test executed, and the REPL printed the concrete `actual` value. The namespace compiled and loaded cleanly (the test ran end-to-end).
- Only one thing changed between the passing baseline and the failing run — this function body — so the failure is causally attributable to the reconstruction.
- The reverted behavior maps exactly to the bug's mechanism: #31926 is stale template-tag dimensions surviving a database switch; the fix stripped them, so undoing the strip reintroduces precisely that.
- I deliberately left the two adjacent fix elements in place (the schema's `:dimension {:optional true}` broadening and the `can-run`/`fully-parameterized` field-filter checks). They are harmless for this path: the schema change only *permits* the dimensionless intermediate state that the stripping *produced*, so with stripping gone the schema change is inert, and the oracle never exercises the `can-run` guard. Reverting them would be unnecessary and would widen blast radius beyond the minimal semantic change. The oracle isolates the dimension-stripping behavior, which is fully controlled by the reverted function.

## 5. Ambiguity / honesty

No blocking ambiguity. The task hinted the behavioral change "likely lives in one" of the two files — it lives in `native.cljc`'s `with-different-database`. The `template_tag.cljc` schema edit (`:dimension` made optional) is a supporting change enabling the fix's output state, not the behavior the oracle checks, so it was correctly left untouched. The reconstruction is minimal, loads, and fails the oracle as an assertion — as required.
