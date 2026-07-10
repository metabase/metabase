# Reconstruction report — metabase#73448 (FE)

_Verbatim final report from the FE reconstruction agent (a4858e4ffaa3007b7)._

---

Reconstruction complete and verified.

## 1. git diff
`frontend/src/metabase/visualizations/click-actions/lib/dashboard-click-drill.js` — removed the dimension-fallback branch from `getClickBehavior`, so it no longer surfaces a clicked bar's x-axis dimension click behavior:

```js
  const columnClickBehavior = getColumnClickBehavior(settings, clicked?.column);
  if (columnClickBehavior) {
    return columnClickBehavior;
  }
-
-  const dimensionClickBehavior = (clicked?.dimensions || [])
-    .map((dimension) => getColumnClickBehavior(settings, dimension.column))
-    .find(Boolean);
-
-  return dimensionClickBehavior || settings.click_behavior;
+  return settings.click_behavior;
```

This is the exact semantic core of bug #73448: on a dashboard bar chart, clicking a bar (whose `clicked.column` is the metric) must fall back to the dimension column's configured click behavior. Reverting only this branch reintroduces the bug while leaving the column-settings lookup, the `DashboardClickAction.tsx` settings injection, `events.ts`, and `links.ts` changes intact.

## 2. Oracle spec + Tests
Oracle: `frontend/src/metabase/dashboard/utils/dashboard-click-drill.unit.spec.js` (the fix's dedicated new spec, directly exercising the primary product file).
- Baseline (fixed): `Tests: 6 passed, 6 total`
- Reconstructed (bug): `Tests: 2 failed, 4 passed, 6 total`

The 2 failures are precisely the two `#73448`-tagged assertions:
- `getClickBehavior › falls back to the click behavior configured on a clicked dimension (#73448)` — `expect(clickBehavior).toBe(dimensionClickBehavior)`
- `DashboardClickAction › creates a click-behavior action for a chart click with a dimension-scoped behavior (#73448)` — `expect(actions).toHaveLength(1)` got `0`

The 4 non-bug tests (clicked-column behavior, column-over-dimension precedence, root fallback, no-behavior→no-action) still pass — confirming the revert is scoped to the bug, not a blanket break.

## 3. failure_shape
Assertion failures (`toBe` value mismatch; `toHaveLength` 1 vs 0). No compile/import/runtime errors — the code path executes and returns wrong values, matching a genuine behavioral regression.

## 4. Confidence + adversarial reasoning
High confidence. Adversarial checks:
- Not a `git apply -R`: I hand-reverted a single logical branch, keeping the surrounding helper (`getColumnClickBehavior`) and all sibling fix files.
- Discriminating, not blanket: 4/6 tests still pass; only the dimension-behavior assertions fail, and both are the ones the fix added for this bug.
- The failure is a value/length assertion, not a missing-symbol or arity error, so it reflects behavior drift rather than a mechanical break.
- Baseline-passes / reconstructed-fails both confirmed from the worktree root (`pwd` verified, symlinks in place), ruling out a wrong-cwd false pass.

## 5. Ambiguity
Minor: the fix bundles two behaviors — a `column_settings` lookup (via `getObjectColumnSettings`) and the dimension fallback. Reverting the full `getClickBehavior` rewrite would fail all 6 tests; I chose the narrower dimension-fallback revert because bug #73448 is specifically about dimension click behavior, and it yields the cleanest discriminating signal (only the `#73448` assertions fail). No `reconstruction_failed`.
