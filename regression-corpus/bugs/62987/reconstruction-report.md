The reconstruction is complete and verified. Here is the final report.

## Regression-corpus FE reconstruction — issue 62987

### 1. git diff (semantic revert)

```diff
diff --git a/frontend/src/metabase-lib/query/clauses/clauses.ts b/frontend/src/metabase-lib/query/clauses/clauses.ts
index ...
@@ export const AGGREGATION_FUNCTIONS = {
-  ...EXPRESSION_FUNCTIONS,
   ...AGGREGATION,
   ...WINDOW,
 } as const;
```

The fix commit `6ce3e4b` added `...EXPRESSION_FUNCTIONS` to `AGGREGATION_FUNCTIONS` so that non-aggregation functions (concat, contains, coalesce, hour, month, notNull, etc.) surface as completions in aggregation context. The product logic **relocated** from `frontend/src/metabase/querying/expressions/config.ts` (at fix time) to `frontend/src/metabase-lib/query/clauses/clauses.ts` (lines 1887-1891 now). Removing the spread reintroduces the bug semantically in the drifted code.

### 2. Oracle

- Spec: `frontend/src/metabase/querying/expressions/suggestions/aggregations.unit.spec.ts` (surviving descendant, same path as the shipped spec)
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/suggestions/aggregations.unit.spec.ts` (run from worktree root)
- Baseline (clean HEAD): **PASS** — Tests: 7 passed, 7 total
- Reconstructed (mutation applied): **FAIL** — Tests: 3 failed, 4 passed, 7 total

### 3. failure_shape

Failing tests (all in `expressionMode = aggregation`):
- `should suggest aggregations`
- `should suggest aggregations, inside a word`
- `should suggest aggregatoins, before parenthesis`

Assertion mismatch is a clean value diff at `expect(results).toEqual(RESULTS)` / `RESULTS_NO_TEMPLATE`: the received `options` array is missing all the non-aggregation function completions the fix added (e.g. `concat`, `contains`, `coalesce`, `hour`, `month`, `monthName`, `notNull`, `second`, `doesNotContain`). Not a compile/import error — the suite loads and runs, values simply differ.

### 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The three failing tests are exactly the ones asserting the full completion set in aggregation mode. The siblings that stay green are discriminating controls:
- `should not suggest aggregations` (expression mode) x2 — unaffected because expression mode never used `AGGREGATION_FUNCTIONS`.
- `should not suggest unsupported aggregations` and `should suggest supported aggregations` — assert filtering/support behavior on the aggregation set, which the mutation doesn't touch.

So the break is scoped to "which functions appear in aggregation suggestions," not a blunt import/render failure that would down the whole suite.

### 5. Outcome

**kill** — with oracle relocation noted (product moved `config.ts` → `metabase-lib/query/clauses/clauses.ts`; spec survived in place). A surviving jest unit spec cleanly discriminates the bug via value assertions. Already closable by the existing unit test; no new test needed. The diff is left in place in the worktree for capture.