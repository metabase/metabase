Done. Here is the report.

## 1. git diff (product mutation)

`frontend/src/metabase/dashboard/actions/parameters.tsx` — semantic revert of fix commit `15e73ac`. Restores the buggy **per-parameter** toggle (reset each pair whose value already equals its current value) instead of the fixed **global all-or-nothing** (`areAllSet`) reset:

```diff
     const parameterValues = getParameterValues(getState());
-    const areAllSet = parameterIdValuePairs.every(([id, value]) =>
-      _.isEqual(value, parameterValues[id]),
-    );
     parameterIdValuePairs
       .map(([id, value]) => {
         let valueToSet = value;
-        if (areAllSet) {
+        if (_.isEqual(value, parameterValues[id])) {
```

The current code had drifted (it grew a `required`/`default` unset branch), so this is a behavior-level revert, not a blind `git apply -R`.

## 2. Witness

New spec: `frontend/src/metabase/dashboard/actions/set-or-unset-parameter-values.unit.spec.ts` (left applied). It dispatches `setOrUnsetParameterValues` through a recording thunk-dispatch over a `createMockState` dashboard with two params, where param `"1"` already equals its new value (`"Gadget"`) and param `"2"` differs. It asserts the plain `setParameterValue` actions that get dispatched:

```ts
expect(byId["1"]).toBe("Gadget");   // matching param must NOT be reset
expect(byId["2"]).toBe("new-vendor");
```

Oracle command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/actions/set-or-unset-parameter-values.unit.spec.ts`

- **PASS on clean HEAD** (product file stashed): 1 passed.
- **FAIL on mutant**: `expect(received).toBe(expected)` — `Expected: "Gadget", Received: null` at the `byId["1"]` assertion (the bug reset the already-matching param to null).

Clean value assertion, not a crash/compile error.

## 3. Bug summary

When a crossfilter click-behavior updates multiple dashboard filters at once and **some** of the target values already match the current filter values while others don't, the buggy code resets the matching ones to null per-parameter. The e2e repro: clicking a "Gadget" cell sets Category=Gadget + Vendor=…; the first assertion checks that when values are only *partially* equal to current, nothing is reset (both filters stay set). The fix only resets when **all** new values already equal the current values (a true toggle-off).

## 4. Outcome

**witness_authored** — the bug is unit-catchable. It lives entirely in a pure-ish Redux thunk (`getParameterValues`/`getParameters` selectors → `setParameterValue` dispatches); no rendering, routing, network, or browser API is required to discriminate the behavior. The e2e is replaceable at the unit level.

## 5. Confidence

High. The mutation is the exact inverse of the fix's decision logic (per-parameter vs. global `areAllSet`), and the witness's partial-equality scenario is the precise case the fix commit and its e2e first assertion target.

One environment note: this worktree's base branch has drifted from `master`, and the harness-mandated symlinked `node_modules` (from `master`) is missing deps the base-branch source needs (`@stardazed/streams-text-encoding` in `jest-setup.js`, `eventsource-parser` via the `getMainStore`→metabot→ai-streaming import chain). To *run* the witness I temporarily aligned `frontend/test/jest-setup.js` with master's version; I reverted that afterward so only the product mutation + witness remain in the worktree. The witness intentionally avoids `getMainStore`/`entities-store` (hand-rolled recording dispatch) so it does not depend on that broken chain — with base-branch-matched `node_modules` it runs against the original `jest-setup.js` unmodified. Both PASS-clean and FAIL-mutant results above were captured with the deps aligned.