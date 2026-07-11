Task complete. Both the product mutation and the witness test are left applied in the worktree.

## 1. git diff (product mutation)

`frontend/src/metabase/dashboard/actions/parameters.tsx` — semantic revert of fix commit `436c0804fa` inside `setOrUnsetParameterValues`:

```diff
-    const areAllSet = parameterIdValuePairs.every(([id, value]) =>
-      _.isEqual(value, parameterValues[id]),
+    const areAllSet = parameterIdValuePairs.every(
+      ([id, value]) => value === parameterValues[id],
     );
```

The fix commit touched a one-line `.map` predicate (`value === parameterValues[id]` → `_.isEqual(...)`); the code has since drifted (the logic moved into an `areAllSet = ...every(...)` check with default/required handling), so this is a behavior-faithful revert at the current site, not a blind `git apply -R`.

## 2. Witness

Added to `frontend/src/metabase/dashboard/actions/parameters.unit.spec.ts` inside the existing `setOrUnsetParameterValues` describe block. It reuses the file's existing redux-store harness (`getMainStore` + mock dashboard state), sets `parameterValues["123"] = [4.6]`, then dispatches `setOrUnsetParameterValues([["123", [4.6]]])` (a structurally-equal but reference-distinct array — the shape a crossfilter `number/=` click produces) and asserts the value is unset to `null`.

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/actions/parameters.unit.spec.ts -t "56716"`

- PASS on clean HEAD (`_.isEqual`): `1 passed`.
- FAIL on mutant (`===`): `Expected: null / Received: [4.6]` at the `toBe(null)` assertion — a clean value assertion, not a compile error.

## 3. Bug summary

With a crossfilter click behavior on a dashboard, clicking the same column value twice should toggle the filter off. The reset compares the incoming click value against the current parameter value. For non-primitive values (arrays, e.g. `[4.6]` for a `number/=` filter), reference equality (`===`) is always false between two distinct arrays, so `areAllSet` never becomes true — the second click re-sets the filter instead of clearing it. The value stays applied and the card stays filtered (the e2e checks the filter no longer contains "4.6" and the card returns to "200 rows").

## 4. Outcome

`witness_authored` — the bug is unit-catchable at the redux-thunk seam; the e2e is replaceable by this jest unit test.

## 5. Confidence

High. The reintroduced mutation is the exact equality operator the fix commit changed, at the same logical decision point (the incoming-vs-current value comparison that governs the toggle-off). The witness isolates precisely that discriminator: identical structure, distinct reference — `_.isEqual` returns true (unset → `null`), `===` returns false (stays `[4.6]`). No rendering, routing, or browser layout is involved; the observable is a pure redux state transition, fully exercised in jsdom.