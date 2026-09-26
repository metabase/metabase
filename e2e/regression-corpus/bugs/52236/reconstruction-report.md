# Reconstruction report — metabase#52236

_Verbatim final report from the worktree-isolated reconstruction agent (ae2f1e53607a1712a)._

---

Reconstruction succeeded. Here is my report.

## 1. `git diff` (product only — no test edits)

```diff
diff --git a/src/metabase/lib/drill_thru/pivot.cljc b/src/metabase/lib/drill_thru/pivot.cljc
@@ -139,6 +139,8 @@
                (some? value)
                (not dimensions-are-untraceable?)
                (lib.underlying/aggregation-sourced? query column)
+               ;; TODO fix this drill thru and remove this check (metabase#52236)
+               (not (lib.underlying/strictly-underlying-aggregation? query column))
                (-> (lib.aggregation/aggregations query stage-number) count pos?))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ae2f1e53607a1712a/src/metabase/lib/drill_thru/pivot.cljc`

## 2. Oracle ns/name + results

- Namespace: `metabase.lib.drill-thru.pivot-test`
- Oracle deftests (all three used): `returns-pivot-test-2a-cat+loc-with-date`, `returns-pivot-test-2b-cat+loc-with-date+category`, `pivot-application-test-1`
- **Baseline (HEAD):** 3 tests, 8 assertions, 0 failures, 0 errors — PASS
- **Reconstructed:** 3 tests, 7 assertions, 3 failures, 0 errors — FAIL

## 3. failure_shape

Assertion failure (not error/compile). Each deftest fails on its `"multi-stage query"` variant: the pivot drill is no longer offered for a query with an appended filter stage over an aggregation, so `pivot-drill` returns `nil`. Example:

```
expected: {:dimensions ({:column {:name "CREATED_AT"}} {:column {:name "CATEGORY"}}),
           :pivots {:category not-empty, :location not-empty, :time nil}, :type :drill-thru/pivot}
  actual: nil
```

The single-stage variants still pass (4 assertions), matching the fix commit's intent that only multi-stage was disabled.

## 4. Confidence + adversarial reasoning

**High confidence.** This is a maximally faithful reconstruction: I re-added the exact one-line guard that fix commit 3e046 introduced into this same function, using the same still-existing helper `lib.underlying/strictly-underlying-aggregation?`. Adversarial checks:
- Real assertion failure, not a compile/error (0 errors, 3 failures; `actual: nil`).
- Minimal and localized — one conditional clause, no test-file edits.
- Directionally correct: `strictly-underlying-aggregation?` is true only for a top-stage column that traces to an underlying aggregation (multi-stage), false for a directly-aggregation-sourced single-stage column — so the guard blocks only the multi-stage path, exactly reproducing the bug behavior the oracle now expects to be fixed.

## 5. Ambiguity note

One wrinkle worth flagging (does not affect the result): fix commit 3e046 was a *stopgap* that both added this product guard AND commented out the multi-stage test variants — so it "removed" assertions rather than "added" them, contrary to the task's generic oracle description. The drill was later properly re-fixed (current HEAD rewrote the function with `top-level-stage-number`/`traceable-dimensions` and the multi-stage test variants were re-enabled). Thus the "fix-added assertions" that must fail are the re-enabled `"multi-stage query"` variants at HEAD, and the minimal semantic revert is reintroducing 3e046's guard line — which is precisely what I did. No `reconstruction_failed`.
