# Reconstruction report — metabase#46845

_Verbatim final report from the worktree-isolated reconstruction agent (ab9329ebe5a246cde)._

---

Reconstruction succeeded. Report follows.

## 1. `git diff`

```diff
diff --git a/src/metabase/query_processor/middleware/add_implicit_joins.clj b/src/metabase/query_processor/middleware/add_implicit_joins.clj
@@ field-opts->fk-field-info @@
-   {:keys [source-field source-field-name source-field-join-alias]} :- :map]
+   {:keys [source-field source-field-name]} :- :map]
   (let [fk-field (lib.metadata/field metadata-providerable source-field)]
     (m/assoc-some {:fk-field-id source-field}
                   :fk-field-name (when (and (some? source-field-name) (not= source-field-name (:name fk-field)))
-                                   source-field-name)
-                  :fk-join-alias source-field-join-alias)))
+                                   source-field-name))))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab9329ebe5a246cde/src/metabase/query_processor/middleware/add_implicit_joins.clj` (`field-opts->fk-field-info`, ~line 110).

## 2. Oracle test + results
- **NS/name:** `metabase.query-processor.middleware.add-implicit-joins-test/source-field-join-alias-test`
- **Baseline (worktree cwd):** PASS — 1 assertion, 0 failures, 0 errors.
- **Reconstructed:** FAIL — 1 assertion, **1 failure, 0 errors** (assertion failure, not an error).

## 3. failure_shape
`=?` mismatch. Dropping `:fk-join-alias` at the extraction point means the implicit join is no longer disambiguated by the explicit source-join alias. Actual output regresses to the pre-fix bug:
- implicit join alias `"PRODUCTS__via__PRODUCT_ID"` instead of `"PRODUCTS__via__PRODUCT_ID__via__Orders"`
- join condition `[:field 24607 nil]` instead of `[:field 24607 {:join-alias "Orders"}]`
- missing `:fk-join-alias "Orders"` on the generated join

This is exactly bug #46845 / PR #52720: "implicit field refs for cases when the source-field is coming from a join."

## 4. Confidence + adversarial reasoning
**High confidence.** The revert is a single expression removal at the semantic origin point where the field ref's `:source-field-join-alias` is read into the middleware's internal `fk-field-info`. With it gone, the value cannot propagate to `join-alias` (naming), the join condition, or the `:fk-join-alias` on the join map — reproducing all three symptoms the fix addressed. Failure is a pure assertion mismatch (0 errors), confirming the code path executes and produces wrong data rather than throwing. The diff mirrors the original commit's semantic (which added `:fk-join-alias source-field-join-alias` in the then-named `field-opts->fk-field-info`).

## 5. Ambiguity (resolved)
The task named `src/metabase/legacy_mbql/schema.cljc` as the product file, but I performed the revert in `add_implicit_joins.clj` instead. Rationale:
- The original commit's `schema.cljc` hunk merely added `:source-field-join-alias` as an `{:optional true}` key. That key has since been **refactored out of the legacy schema** and now lives in `src/metabase/lib/schema/ref.cljc:135` (`::field.options`).
- More importantly, that schema entry is **behaviorally inert** for this test: `::field.options` is an open `:map` (extra keys permitted), and `normalize-field-options-map` only renames/strips-nil — it does not drop unknown keys. So removing the schema key would neither reject nor strip `:source-field-join-alias` from the input query, and the oracle test would still pass. The behavioral fix guarded by `source-field-join-alias-test` is entirely in the `add_implicit_joins` middleware (the commit's 117-line hunk), which is where I localized the minimal semantic revert.

No `reconstruction_failed`.
