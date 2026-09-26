# Reconstruction report — metabase#61010

_Verbatim final report from the worktree-isolated reconstruction agent (afa84a7a0dbb9b484)._

---

Reconstruction complete and proven. Here is the full report.

## 1. Reconstruction diff

Two functions in two files, each reverted to pre-fix behavior (semantic undo, not `git apply -R` — the surrounding code has drifted: `metadata-method :aggregation` now uses uuid refs + `with-cache-ephemeral*`, and I left its intact `:name`/`:display-name` carrying logic untouched).

`/Users/fraser/Documents/code/metabase/src/metabase/lib/aggregation.cljc` — `aggregable-columns` (3-arity):
```clojure
;; FIXED (current):
   (let [agg-cols (aggregations-metadata query stage-number)
         columns (into (vec (lib.metadata.calculation/visible-columns query stage-number))
                       (cond->> agg-cols
                         aggregation-position (keep-indexed (fn [i a]
                                                              (when (not= i aggregation-position) a)))))]
;; RECONSTRUCTED (buggy): include ALL aggregations, no position exclusion
   (let [columns (into (vec (lib.metadata.calculation/visible-columns query stage-number))
                       (aggregations-metadata query stage-number))]
```
(param renamed `aggregation-position` → `_aggregation-position` since now unused, matching the pre-fix source.)

`/Users/fraser/Documents/code/metabase/src/metabase/lib/expression.cljc` — `expressionable-columns` (3-arity): dropped the `expr-name` lookup and the `remove` that filtered out the expression being edited; now returns raw `visible-columns` (param → `_expression-position`).

## 2. Oracle

- Namespace/name: `metabase.lib.aggregation-test/aggregable-columns-e2e-test` (`test/metabase/lib/aggregation_test.cljc:915`)
- Baseline (current code): PASS — 8 assertions, 0 failures, 0 errors.
- Reconstructed: FAIL — 8 assertions, 4 failures, 0 errors. The 4 passing assertions are the non-positional listings (lines 946/948/950/952, `["count"]`→`["count" "a" "b" "c"]`), confirming name resolution via the still-intact `metadata-method` is unaffected. The 4 failures are all the `(doseq [pos ...])` block at `aggregation_test.cljc:954`, e.g. `expected: ("a" "b" "c") actual: ("count" "a" "b" "c")` — i.e. when editing the aggregation at `pos`, the buggy code offers that very aggregation as an aggregable column.

## 3. failure_shape

- symptom: When editing an existing aggregation (or custom expression), the column being edited is offered back as a selectable input column — enabling a self-reference / cyclic definition. This is exactly bug #61010 ("Stop offering expressions and aggregation being edited as columns").
- repro_failure: assertion failure — `expected: ("a" "b" "c"), actual: ("count" "a" "b" "c")` at `aggregation_test.cljc:954`. Value mismatch, not a compile/load error.

## 4. Confidence + adversarial reasoning

High confidence.
- Assertion failure, not load/compile error: run reports `0 errors`, the namespace loaded, and 4 of 8 assertions still pass with value-diff output — proving clean execution.
- Fails for the right reason: only the position/exclusion assertions regressed; the general column-listing and name-resolution assertions still pass, so I did not over-revert or break unrelated machinery (e.g. the `:name` carrying in `metadata-method`, which drift preserved and I deliberately left alone).
- Not a coincidental break: the buggy `actual` values are precisely "the full aggregate list including the edited position," which is the exact pre-fix behavior the fix commit removed via `keep-indexed`.
- expression.cljc caveat (honest): the oracle does not exercise `expressionable-columns`, so that half of the revert is not independently proven by this test — it's the analogous custom-column half of the same #61010 fix (covered by a separate e2e test in the frontend/other suites). I reverted it to faithfully reintroduce the complete bug behavior described by the fix commit; it compiled cleanly (0 errors) and did not perturb the oracle's passing assertions. If strict minimality-to-oracle were required, the aggregation.cljc edit alone is sufficient to fail the oracle.

## 5. Ambiguity

The only judgment call is whether to also revert `expression.cljc` (not needed to fail the named oracle). I chose to, for faithfulness to the two-part fix; it is cleanly separable and can be dropped if you want the aggregation-only minimal reconstruction. No blockers — reconstruction is fully possible and proven.
