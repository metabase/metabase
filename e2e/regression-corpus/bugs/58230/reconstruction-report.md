The reconstruction is complete. Final report below.

---

## 1. git diff (semantic revert)

```diff
diff --git a/frontend/src/metabase/querying/expressions/mode.ts b/frontend/src/metabase/querying/expressions/mode.ts
@@ -31,12 +31,7 @@ export function checkExpressionModeSupportsClause(
     throw new DiagnosticError(t`Unknown operator ${operator}`);
   }
 
-  const clause = getClauseDefinition(operator);
-  if (clause.type === "aggregation" && expressionMode !== "aggregation") {
-    return new DiagnosticError(
-      t`Aggregations like ${clause.displayName} are not allowed when building a custom ${expressionModeDisplayName(expressionMode)}`,
-    );
-  }
+  getClauseDefinition(operator);
 
   return null;
 }
```

This reintroduces the #58230 bug: aggregation clauses (Count, Sum, CountIf, Percentile, …) are no longer rejected in `filter`/`expression` mode. The guard is the exact logic the fix added; removing it is the semantic inverse of the fix. (The bare `getClauseDefinition(operator)` call is kept only to preserve the pre-fix control flow; it has no side effect.)

## 2. Oracle

- **Spec (relocated):** `frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts`
  - Original shipped spec was `frontend/src/metabase-lib/v1/expressions/diagnostics/diagnostics.unit.spec.ts`; the whole `metabase-lib/v1/expressions` module was moved to `metabase/querying/expressions`. Product file `mode.ts` moved the same way.
- **Command:** `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts` (run from worktree root, cljs+node_modules symlinked)
- **Baseline (clean HEAD):** Tests: 176 passed, 176 total.
- **Reconstructed (mutation applied):** Tests: 2 failed, 174 passed, 176 total.

## 3. failure_shape

Both failures are clean value-assertion mismatches (not compile/import errors):

- `diagnostics › diagnose › should reject aggregations functions in expression mode`
  - Expected: `"Aggregations like CumulativeCount are not allowed when building a custom expression"`
  - Received: `"Function CumulativeCount expects 0 arguments"`
- `diagnostics › diagnose › should reject aggregations functions in filter mode`
  - Expected: `"Aggregations like CumulativeCount are not allowed when building a custom filter"`
  - Received: `"Function CumulativeCount expects 0 arguments"`

With the mode guard gone, the aggregation passes the mode check and falls through to a later diagnostic (arg-count), yielding the wrong message — exactly the buggy behavior.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. Only the two `reject aggregations functions in {expression,filter} mode` tests fail; the other 174 diagnostics tests (parentheses, tokens, arg validators, comparison operators, known/supported-function checks, `diagnoseAndCompile`) stay green. The revert touches one branch in `checkExpressionModeSupportsClause`, and the failing tests are precisely the ones that exercise aggregation-in-wrong-mode. The received messages are meaningful downstream diagnostics (not `undefined`/throw), confirming the pipeline still runs and only the mode-support gate was removed — a targeted behavioral break, not a blunt one.

## 5. Outcome

**kill** — the fix's regression protection survives as a discriminating jest spec (relocated `metabase-lib/v1/expressions/…` → `metabase/querying/expressions/…`). The unit test `diagnostics.unit.spec.ts` catches the reintroduced bug with a clean value assertion. No new test needed; existing unit coverage is sufficient.