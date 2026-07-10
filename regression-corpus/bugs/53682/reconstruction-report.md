The reconstruction is complete and successful. The diff is left in the worktree.

## 1. git diff (semantic revert)

`frontend/src/metabase/querying/expressions/diagnostics/expression/check-arg-count.ts` — removed the `if (argCount < minArgCount)` throw inside the `if (multiple)` branch, reintroducing the historical bug where multi-arg expression functions (`contains`, `in`, `startsWith`, etc.) skip minimum-argument-count validation:

```diff
     if (multiple) {
-      const argCount = operands.length;
-      const minArgCount = args.length;
-
-      if (argCount < minArgCount) {
-        error(node, ngettext(
-          msgid`Function ${displayName} expects at least ${minArgCount} argument`,
-          `Function ${displayName} expects at least ${minArgCount} arguments`,
-          minArgCount,
-        ));
-      }
+      // bug reintroduced: multi-arg functions skip the minimum-arg-count check
     } else {
```

## 2. Oracle

- Spec: `frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts` (the `arg count validation` describe block).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts -t "arg count"`
- Baseline (clean HEAD): PASS — Tests: 13 passed, 163 skipped.
- Reconstructed (mutated): FAIL — Tests: 6 failed, 7 passed, 163 skipped.

## 3. failure_shape

Six failing tests, all clean value-assertion mismatches (no compile/import error):
- `should reject multi-arg function calls without options when there is not enough arguments` (`in`, `notIn`)
- `should reject when there is not enough arguments for contains / doesNotContain / startsWith / endsWith`

Example: `expect(err("contains(\"foo\")")).toBe("Function contains expects at least 2 arguments")` — Expected `"Function contains expects at least 2 arguments"`, Received `"Types are incompatible."` (a different diagnostic now surfaces first, or the error is `undefined`). Either way the arg-count message is gone.

## 4. Confidence + adversarial

High confidence — the failure isolates exactly the reverted `multiple`-branch behavior. Sibling tests in the same block stay GREEN: `should catch mismatched number of function parameters` (`between`, non-multiple), `interval` / `week` / `weekday` arg-count rejections (all non-multiple, still validated by the untouched `else` branch), variadic acceptance, and number/logical operator acceptance. Only the `multiple: true` functions lose their minimum-arg guard, which is precisely the bug class the fix commit addressed.

## 5. Outcome

`kill`. Oracle relocation noted: the shipped product file `frontend/src/metabase-lib/v1/expressions/resolver.js` was refactored/module-extracted into `frontend/src/metabase/querying/expressions/diagnostics/expression/check-arg-count.ts`, and the shipped jest spec `frontend/test/metabase/lib/expressions/resolver.unit.spec.js` has a surviving discriminating descendant in `frontend/src/metabase/querying/expressions/diagnostics/diagnostics.unit.spec.ts`. The bug is caught by a jest unit test today; already closable, no new test needed.