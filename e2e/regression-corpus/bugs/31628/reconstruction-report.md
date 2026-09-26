The reconstruction is complete and the diff is left in the worktree. Final report.

---

## 1. git diff (semantic revert)

`frontend/src/metabase/visualizations/components/ScalarValue/utils.ts` — `findSize`:

```diff
-  while (
-    (metrics.width > targetWidth || metrics.height > targetHeight) &&
-    size > min
-  ) {
+  while (metrics.width > targetWidth && size > min) {
```

This reintroduces the original bug: the scalar font-size search shrinks only on width overflow and ignores height. It is a semantic revert of the load-bearing fix (the fix commit's product change added the `|| metrics.height > targetHeight` term and the `targetHeight` input, alongside `measureText` returning height via `actualBoundingBoxAscent/Descent`). The `targetHeight` field/param is left intact so nothing else breaks — the bug is precisely the dropped height comparison.

## 2. Oracle

- Spec: `frontend/src/metabase/visualizations/components/ScalarValue/utils.unit.spec.ts` (surviving descendant at the SAME path; only the `measure-text` import moved `metabase/lib/` → `metabase/utils/`, and the mock now returns `{width, height}`).
- Command (from worktree root `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ab5cec0c28bfcbad5`): `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/components/ScalarValue/utils.unit.spec.ts`
- Baseline (clean HEAD): Tests: 6 passed, 6 total.
- Reconstructed (bug applied): Tests: 2 failed, 4 passed, 6 total.

## 3. failure_shape

- `findSize › returns the min size if text cannot fit into the target height`: mock width=50 (< targetWidth 100), height=120 (> targetHeight 100). Expected `"2rem"`, received `"5rem"` — loop never entered because width already fits.
- `findSize › returns the first size with which text height is smaller than the target height`: heights 120→110→100 with widths 70/60/50 all under target. Expected `"4.6rem"`, received `"5rem"`.

Both are clean value assertions (string mismatch), not compile/import errors.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The three width-driven tests stay green (width check untouched), and the fourth height test — "returns the max size if when text height is smaller than the target height" (width=50, height=100, both within target → `"5rem"`) — stays green because it is non-discriminating (the buggy and fixed code both return max here). Only the two tests that require the value to shrink due to height overflow flip, and they flip to the exact max-size value the width-only bug produces. No import/type breakage; `targetHeight` remains a valid field.

## 5. Outcome

`kill`. A surviving, discriminating jest spec (relocated only by import path, same file location) catches the semantic regression. The behavioral fix is protected at the unit level; no new test needed.