The reconstruction succeeded. Leaving the diff in the worktree as instructed. Here is the final report.

---

## 1. git diff — semantic revert

```diff
diff --git a/frontend/src/metabase-lib/query/clauses/clauses.ts b/frontend/src/metabase-lib/query/clauses/clauses.ts
@@ -672,7 +672,6 @@ const STRING = defineClauses(
     contains: {
       displayName: "contains",
       type: "boolean",
-      multiple: true,
       hasOptions: true,
```

The original fix (#50480) added `multiple: true` to the `contains`/`does-not-contain`/`starts-with`/`ends-with` clause definitions so these operators accept a variable number of string arguments. Removing it from the `contains` clause reintroduces the historical bug: `contains` reverts to a fixed 2-argument operator and no longer supports multiple search values.

## 2. Oracle

- **Spec (relocated descendant):** `frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts`
- **Command (from worktree root):** `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts`
- **Baseline (clean HEAD):** Tests: 176 passed, 176 total
- **Reconstructed (mutation applied):** Tests: 1 failed, 175 passed, 176 total

Note on relocation: the shipped jest specs (`frontend/test/metabase/lib/expressions/*.unit.spec.js`, `frontend/src/metabase-lib/filter.unit.spec.ts`) are all gone — the entire `metabase-lib/v1/expressions` module was rewritten into a Pratt compiler under `frontend/src/metabase/querying/expressions/`. The old `recursive-parser`/`adjustMultiArgOptions` reordering logic is architecturally obsolete (options are now a separate field on `Lib.ExpressionParts`, not a positional array element). The surviving discriminator for the `multiple`-arg semantics is the arg-count diagnostic (descendant of the old `diagnostics.unit.spec.js` arg-count test, which the fix changed from "contains expects 2 arguments" to variable-arg behavior).

## 3. failure_shape

- **Failing test:** `diagnostics › diagnose › arg count validation › should reject when there is not enough arguments for contains`
- **Assertion mismatch:** `err("contains()")` — Expected: `"Function contains expects at least 2 arguments"`, Received: `"Function contains expects 2 arguments"`. Clean value mismatch (not a compile/import error). With `multiple` gone, `checkArgCount` (`frontend/src/metabase/querying/expressions/diagnostics/expression/check-arg-count.ts`) takes the fixed-arity `else` branch instead of the variadic "at least N" branch.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The oracle test is `it.each(["contains","doesNotContain","startsWith","endsWith"])`; I removed `multiple` from **only** the `contains` clause, so:
- `should reject … for contains` → FAILS
- `should reject … for doesNotContain`, `startsWith`, `endsWith` → stay GREEN (their `multiple: true` is untouched)

The other 175 tests pass, confirming this is a surgical behavioral flip on `contains` arg-count semantics, not a blunt module break. The `compile-expression.unit.spec.ts` multi-arg cases stay green because their args are string literals (3 operands sits exactly on the non-multiple `maxArgCount = 2 + 1` boundary, so no diagnostic trips there) — the discrimination surfaces precisely at the arg-count error-message level, which is what the fix targeted.

## 5. Outcome

**`kill`** — a surviving jest spec (relocated from the deleted `frontend/test/metabase/lib/expressions/diagnostics.unit.spec.js` into `frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts`) cleanly catches the semantic reintroduction of the bug. This regression is closable by unit test; no Cypress-only hole. The diff is left in the worktree for capture.