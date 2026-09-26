# Reconstruction report — metabase#34278

_Verbatim final report from the worktree-isolated reconstruction agent (ae9f957248550bdae)._

---

Reconstruction complete and proven. Report below.

## 1. Reconstruction `git diff`

File: `/Users/fraser/Documents/code/metabase/src/metabase/query_processor/pivot.clj` (worktree copy edited; product code, not test)

```diff
@@ -418,16 +418,10 @@ (mu/defn- pivot-options :- ::pivot-opts
   ...docstring unchanged...
-  [query        :- [:map
-                    [:database ::lib.schema.id/database]]
-   viz-settings :- [:maybe :map]]
-  (when viz-settings
-    (let [{:keys [rows columns]} (:pivot_table.column_split viz-settings)]
-      (merge
-       (if (and (every? string? rows) (every? string? columns))
-         (column-name-pivot-options query viz-settings)
-         (field-ref-pivot-options query viz-settings))
-       {:column-sort-order (column-sort-order query viz-settings)}))))
+  [query         :- [:map
+                     [:database ::lib.schema.id/database]]
+   _viz-settings :- [:maybe :map]]
+  (not-empty (select-keys query [:pivot-rows :pivot-cols :pivot-measures :show-row-totals :show-column-totals])))
```

### Localization / semantic rationale
The fix commit `42bd30c6` ("Determine `pivot-cols` and `pivot-rows` on the backend using viz settings", #34583) introduced a `pivot-options` fn that derives the pivot row/column breakout indices from the card's `:pivot_table.column_split` viz-settings. Pre-fix, the backend did **not** derive these — `generate-queries` read frontend-supplied `:pivot-rows`/`:pivot-cols` straight off `outer-query`.

The code has drifted heavily since 2023: the original single `pivot-options` fn is now a dispatcher over `column-name-pivot-options` (new-style, column-name → index) and `field-ref-pivot-options` (legacy, ref → index), plus `column-sort-order`. So `git apply -R` no longer works. I localized the commit's core behavioral change to today's `pivot-options` dispatcher (`src/metabase/query_processor/pivot.clj:415`) and semantically reverted it to the pre-fix behavior: ignore viz-settings entirely and read pivot options directly off the query (the frontend-supplied path — which is exactly what `run-pivot-query`'s final fallback still does). This is the faithful inverse of "determine on the backend using viz settings."

## 2. Oracle
- **Namespace/name:** `metabase.query-processor.pivot-test/pivot-options-test` (`test/metabase/query_processor/pivot_test.clj:188`)
- **Baseline (pristine current code):** PASS — `3 assertions, 0 failures, 0 errors`
- **Reconstructed:** FAIL — `3 assertions, 1 failure, 0 errors` (2 pass, 1 fail). The two `breakout-combinations` `are` assertions still pass; the direct `pivot-options` assertion fails.

## 3. failure_shape
- **symptom:** The backend no longer derives `pivot-rows`/`pivot-cols` from the card's `pivot_table.column_split` viz-settings. `(#'qp.pivot/pivot-options query viz-settings)` returns `nil` instead of `{:pivot-rows [1 0] :pivot-cols [2] :pivot-measures nil :column-sort-order {} :show-row-totals true :show-column-totals true}`. In production this means saved-card / dashboard / embedded / subscription pivots (contexts where the frontend doesn't hand the backend explicit pivot indices) collapse to a degenerate single-group pivot.
- **repro_failure:**
  ```
  FAIL in metabase.query-processor.pivot-test/pivot-options-test (pivot_test.clj:194)
  expected: {:pivot-rows [1 0], :pivot-cols [2], :pivot-measures nil,
             :column-sort-order {}, :show-row-totals true, :show-column-totals true}
    actual: nil
  ```

## 4. Confidence + adversarial reasoning
**High confidence.**
- **Assertion, not compile/load:** The run reports `3 assertions, 1 failure, 0 errors` — the namespace compiled and loaded, all three assertions executed, and the `are` (breakout-combinations) assertions still passed. A load/compile failure would show `errors`, not a clean `actual: nil` diff.
- **Right bug, not a generic break:** The commit's entire purpose was deriving pivot indices from viz-settings; returning `nil` (falling through to the frontend-supplied query keys, absent here) reproduces the precise pre-fix reality rather than an unrelated crash. The `::pivot-opts` schema is `[:maybe [:map ...]]` with all-optional `[:maybe ...]` keys, so `nil` is schema-valid — the failure is a wrong-value assertion, exactly as a behavioral regression should present.
- **Minimal + localized:** One fn body changed, in the exact fn the fix introduced. No test files touched (oracle used as-is).

## 5. Ambiguity / honesty
Minor: two candidate reconstruction sites existed — the `pivot-options` dispatcher (chosen) vs. the inner `column-name-pivot-options` index-mapping. I chose the dispatcher because it maps 1:1 to the commit boundary (the commit added `pivot-options` as the single entry point) and is the most faithful "don't determine from viz-settings" inverse; breaking the inner index map would be a proxy for the same behavior. Note the chosen edit leaves `column-name-pivot-options` / `field-ref-pivot-options` / `column-sort-order` defined-but-unused — harmless (loads fine, at most a kondo unused-var lint), and it broadens the blast radius to other pivot-options tests (`ignore-bad-pivot-options-test`, `nested-question-pivot-options-test`), which is expected since they exercise the same removed derivation. The task's oracle (`pivot-options-test`) fails cleanly as required.
