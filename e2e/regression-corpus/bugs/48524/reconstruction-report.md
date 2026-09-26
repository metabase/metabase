The reconstruction is complete and the diff is left in the worktree. Here is the final report.

## 1. git diff — semantic revert

`frontend/src/metabase/parameters/utils/parameter-parsing.ts`

Removed the `hasQueryParams` guard from `getParameterValueFromQueryParams`, restoring the pre-fix behavior where last-used parameter values are applied even when other parameters are set via the URL:

```diff
-  const hasQueryParams = Object.keys(params).length > 0;
   ...
-    if (hasQueryParams) {
-      return parameter.default ?? null;
-    } else {
-      return lastUsedValues[parameter.id] ?? parameter.default ?? null;
-    }
+    return lastUsedValues[parameter.id] ?? parameter.default ?? null;
```

This is a semantic revert against drifted code, not `git apply -R`: the file moved from `metabase-lib/v1/parameters/utils/` to `metabase/parameters/utils/` and the fix's `queryParams`/`lastUsedParametersValues` params were refactored into local `params`/`lastUsedValues` bindings.

## 2. Oracle

- Spec: `frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js`
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/parameters/utils/parameter-parsing.unit.spec.js` (from worktree root)
- Baseline (clean HEAD): Tests: 47 passed, 47 total
- Reconstructed (bug applied): Tests: 1 failed, 46 passed, 47 total

## 3. failure_shape

Failing test: `getParameterValueFromQueryParams › last used param value › should not allow mixed query and last used parameter values (metabase#48524)`

```
expect(received).toEqual(expected) // deep equality
Expected: null
Received: "last used value"
```

The test calls `getParameterValueFromQueryParams(parameter1, { [parameter2.slug]: "value" }, { [parameter1.id]: "last used value" })` — parameter1 has no URL value but parameter2 does. With the guard removed it wrongly falls back to the last-used value instead of returning `null`.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The two sibling tests in the same `last used param value` block stay green and pin the boundary: "should use query parameter over last used param value" (URL value present for the same param) and "should use last used param value when query parameter is empty" (empty `queryParams` `{}`, so last-used still legitimately applies). Only the mixed-URL case flips, which is exactly the semantic the `hasQueryParams` guard governs. All 46 other assertions pass, so this is a targeted value mismatch, not a blunt compile/import break (I also deleted the now-unused `hasQueryParams` binding to avoid any noise).

## 5. Outcome

`kill`. The fix's shipped jest spec survives as a relocated descendant (`metabase-lib/v1/parameters/utils/parameter-parsing.unit.spec.js` → `metabase/parameters/utils/parameter-parsing.unit.spec.js`) and discriminates the bug cleanly. No new unit test needed — the regression is already covered at the jest level. The diff remains in the worktree for capture.