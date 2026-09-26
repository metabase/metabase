# Reconstruction report — metabase#35561

_Verbatim final report from the worktree-isolated reconstruction agent (a8c55cdf33a4ae6c0)._

---

Reconstruction complete and validated. Here's the report.

## 1. Reconstruction (unified diff)

```diff
diff --git a/src/metabase/lib/drill_thru/fk_filter.cljc b/src/metabase/lib/drill_thru/fk_filter.cljc
index 5266f3fe879..c3fd7c522ae 100644
--- a/src/metabase/lib/drill_thru/fk_filter.cljc
+++ b/src/metabase/lib/drill_thru/fk_filter.cljc
@@ -47,6 +47,7 @@
    {:keys [column column-ref value], :as _context} :- ::lib.schema.drill-thru/context]
   (when (and column
              (some? value)
+             (not= value :null)         ; If the FK is null, don't show this option.
              (lib.drill-thru.common/mbql-stage? query stage-number)
              (not (lib.types.isa/primary-key? column))
              (lib.types.isa/foreign-key? column))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a8c55cdf33a4ae6c0/src/metabase/lib/drill_thru/fk_filter.cljc`

## 2. Oracle + results

- Oracle ns/name: `metabase.lib.drill-thru.fk-filter-test/return-fk-filter-for-null-fk-test`
  (from `test/metabase/lib/drill_thru/fk_filter_test.cljc:56`)
- Baseline (clean worktree): PASS — 4 assertions, 0 failures, 0 errors.
- Reconstructed: FAIL — 4 assertions, **2 failures**, 0 errors. Code loads/compiles fine (a genuine assertion failure, not a load error).
  - The 2 passing assertions are the "returned with non-NULL value" branch.
  - The 2 failing assertions are the "returned with NULL value" branch: `test-returns-drill` on the row with `PRODUCT_ID` = nil expects `{:type :drill-thru/fk-filter}` but gets `nil` (available drills reduce to `#{:drill-thru/zoom}`).

## 3. failure_shape

- **symptom:** Clicking a NULL foreign-key cell offers no "Filter by this FK" drill-thru — the user cannot filter a table by a null FK (the IS NULL filter option is silently absent).
- **repro_failure:** `return-fk-filter-for-null-fk-test` — the NULL-value sub-`testing` block; `test-returns-drill` asserts a `:drill-thru/fk-filter` is returned, actual `nil`. 2 of 4 assertions fail.

## 4. Confidence + adversarial reasoning

**Confidence: very high.** This is the exact historical bug, not merely *a* change that trips the test.

- The fix commit (71f7fe6) made two coupled edits: (a) it *removed* the guard `(not= value :null)` from the `when`, and (b) it introduced `filter-expr` to emit `is-null` when `value` is `:null` instead of always emitting `=`. My reconstruction re-adds exactly guard (a).
- The correspondence hinges on how NULL cells are represented in drill context: a clicked null value arrives as the keyword `:null` (not `nil`), so `(some? value)` is true and does **not** filter it out. The pre-fix code therefore needed the explicit `(not= value :null)` to short-circuit — which is precisely the line the fix deleted and I restored. My repro (drill returns `nil` for the null row) confirms this representation.
- With the guard restored, the `is-null` branch of `filter-expr` becomes dead/unreachable (the drill is rejected before construction), which is behaviorally identical to the pre-fix world where that branch didn't exist at all. So no residual fix behavior leaks through.
- I chose the guard re-add over also reverting `filter-expr` because the guard alone fully and minimally reproduces the observable bug (no drill offered); reverting `filter-expr` too would be redundant since that code path is never reached.

## 5. Ambiguity

None material. One note: a sibling test, `fk-filter-availability-test` (same file, line 15), also asserts NULL-FK availability and would fail under this reconstruction too — consistent with, and reinforcing, the same behavioral regression. The designated oracle behaves exactly as required.
