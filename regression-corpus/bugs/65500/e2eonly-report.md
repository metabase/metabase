Both the mutation and the witness are left in the worktree. Task complete.

## Report

### 1. git diff (product mutation)
`frontend/src/metabase/common/hooks/is-route-in-sync.ts`
```diff
   if (isWithinIframe()) {
-    return isRouteInSync;
+    return true;
   }
 
   return true;
```

The fix commit `a033c12` added a route-sync guard in two components (`DashboardApp.tsx`, `QueryBuilder.tsx`): `if (!isRouteInSync(location.pathname)) return null`. Since the fix, the codebase drifted — the guard logic was extracted into the pure helper `isRouteInSync(pathname)`, which is what both call sites now use. The minimal semantic revert neuters that helper so the iframe branch always reports "in sync" (`true`), exactly the pre-fix behavior where no guard existed. Both call sites' `if (!isRouteInSync(...))` become permanently false, so the app renders/initializes even while the route is stale — reintroducing the bug at both DashboardApp and QueryBuilder simultaneously with one edit.

### 2. Witness
New spec: `frontend/src/metabase/common/hooks/is-route-in-sync.witness.unit.spec.ts`
```ts
it("returns false inside an iframe when the router route lags window.location", () => {
  (window as any).overrideIsWithinIframe = true;
  window.history.pushState({}, "", "/dashboard/1");
  expect(isRouteInSync("/dashboard/9999990")).toBe(false);
});
```
Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/common/hooks/is-route-in-sync.witness.unit.spec.ts`
- PASS on clean HEAD (`return isRouteInSync`).
- FAIL on mutant (`return true`): `expect(received).toBe(expected)` — `Expected: false / Received: true`.

(The existing `is-route-in-sync.unit.spec.ts` already contains an equivalent assertion, independently confirming unit-catchability.)

### 3. Bug summary
In interactive embedding, navigating via `postMessage` (`{metabase:{type:"location", location:url}}`) updates `window.location.pathname` before react-router propagates the new `location` prop to the page component. During that window `window.location.pathname !== location.pathname`. Without the guard the Dashboard/QueryBuilder initializes against the stale prop, and going from an invalid entity (e.g. `/dashboard/9999990`, a 404 "We're a little lost") to a valid one leaves the app stuck on the 404 state. The e2e repro cycles invalid→valid across dashboard/question combinations and asserts the valid content renders; the reintroduced bug makes it stay lost.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The fix's decision logic is a pure, exported, string-in/boolean-out function (`isRouteInSync`) whose sole input is `window.location.pathname` vs. the passed pathname, gated by `isWithinIframe()` (overridable in jsdom via `window.overrideIsWithinIframe`). No render, routing engine, or real browser is needed to discriminate clean vs. mutant. The e2e is replaceable at this seam.

### 5. Confidence
High. The mutation targets the exact seam both fixed components depend on; setting `return true` reproduces the pre-fix "no guard" behavior globally, and the witness pins the one discriminating value (`false` when in-iframe and out-of-sync). Confirmed FAIL-on-mutant / PASS-on-clean by reverting and re-applying in place (no git stash). Note: the incidental `SearchBar.styled.tsx` isPropValid change in the fix commit is unrelated cosmetic churn, not part of the route-sync fix, so it is not reverted.