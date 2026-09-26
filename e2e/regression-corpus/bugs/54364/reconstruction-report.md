# Reconstruction report — metabase#54364 (FE)

_Verbatim report (a4b039560d8db7b47)._

---

Reconstruction is clean and confirmed. Here is my report.

## Report

### (1) git diff
```diff
diff --git a/frontend/src/metabase/querying/parameters/utils/parsing.ts b/frontend/src/metabase/querying/parameters/utils/parsing.ts
@@ -60,12 +60,7 @@ export function deserializeNumberParameterValue(
     return null;
   }, []);
 
-  // allow "between" values without min or max, e.g. `[1, null]` or `[null, 2]`
-  return type === "number/between" &&
-    values.length === 2 &&
-    values.some(isNotNull)
-    ? values
-    : values.filter(isNotNull);
+  return values.filter(isNotNull);
 }
```
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a4b039560d8db7b47/frontend/src/metabase/querying/parameters/utils/parsing.ts`

### (2) Oracle + results
Discriminating oracle: `frontend/src/metabase/querying/parameters/utils/parsing.unit.spec.ts`
- Baseline (fix present): `Tests: 167 passed, 167 total`
- Reconstructed (bug reintroduced): `Tests: 4 failed, 163 passed, 167 total`

I chose this oracle over `NumberInputWidget.unit.spec.tsx` because it directly exercises the changed function `deserializeNumberParameterValue(type, value)` — the tightest localization of the product change. The widget spec is a higher-level consumer of the same behavior.

### (3) failure_shape
Assertion failure (deep-equality). The 4 failing cases are exactly the fix-added `number/between` partial-null assertions:
- `deserializeNumberParameterValue("number/between", [10, null])` → Expected `[10, null]`, Received `[10]`
- `["9007199254740993", null]` → Received `[9007199254740993n]`
- `[null, 20]` → Received `[20]`
- `[null, "9007199254740993"]` → Received `[9007199254740993n]`

All show `- Expected -1 / + Received +0` (the null element is dropped). No compile/import errors — 163 unrelated assertions still pass.

### (4) Confidence + adversarial reasoning
High confidence. The fix (#62614) "Fix the UI for partial between parameter values" centers on letting a `number/between` filter keep a slot when only min or only max is supplied — i.e. `[10, null]` / `[null, 20]` must survive deserialization instead of collapsing to a single-element array. My revert removes precisely that special-case branch so the function unconditionally `filter(isNotNull)`s, reproducing the pre-fix behavior where partial between values were silently truncated.

Adversarial checks:
- Not `git apply -R`: I preserved the drifted imports (`metabase/utils/number`, `metabase/utils/types`), the new `type: ParameterType` signature, and every other fix hunk (serialize bigint handling, `ParameterValueOrArray` null type, widget changes). Only the one discriminating return expression was semantically reverted.
- Genuine assertion failure, not a transpile break: `type` becomes unused but jest/babel does not type-check, so the suite runs and fails as value mismatches (163 pass).
- Targeted: baseline was a full 167-pass; only the 4 fix-added between-null assertions flip. No collateral breakage.

### (5) Ambiguity
None. Single-hunk, unambiguous mapping between the fix's core logic and the fix-added oracle assertions. Not a honest-negative category — a real unit oracle exists and the reconstruction produces clean assertion failures.
