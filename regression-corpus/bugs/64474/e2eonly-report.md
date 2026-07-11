Done. Outcome: **witness_authored**.

## 1. git diff (product mutation)

The fix commit (`d1cb9336`, PR #64726) originally lived in `enterprise/.../use-query-results.ts` using a `defer()`/`cancelDeferred` mechanism. The code has since drifted into OSS and now uses RTK Query's `useLazyGetAdhocQueryQuery` with `action.abort`. The semantic revert reintroduces the original bug — `handleCancelQuery` used to `return null` (a no-op) — by making the current `cancelQuery` a no-op:

File: `frontend/src/metabase/querying/editor/hooks/use-query-results/use-query-results.ts`
```diff
   const cancelQuery = () => {
-    abortRef.current?.();
-    abortRef.current = undefined;
+    return null;
   };
```

## 2. Witness

New spec (added, left applied): `frontend/src/metabase/querying/editor/hooks/use-query-results/use-query-results-cancel.unit.spec.ts`

It mocks `metabase/api`'s `useLazyGetAdhocQueryQuery` so the query action is a never-resolving promise (models a request still in flight — necessary because clean `runQuery` clears `abortRef` once the await resolves). It starts `runQuery()` without awaiting, then calls `cancelQuery()` and asserts the action's `abort` was invoked.

Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/querying/editor/hooks/use-query-results/use-query-results-cancel.unit.spec.ts`
- Clean HEAD: PASS
- Mutant: FAIL — `expect(mockAbort).toHaveBeenCalledTimes(1)` → `Received number of calls: 0`

## 3. Bug summary

While a SQL transform preview is running, clicking the run/cancel button again should cancel (abort) the in-flight query and clear the loading indicator. With the bug, `cancelQuery` does nothing, so the request keeps running and the loading indicator never disappears. The e2e (`transforms.cy.spec.ts`, `metabase#64474`) checks exactly this: start a slow query, see `loading-indicator` visible, click again, expect `loading-indicator` to not exist.

## 4. Outcome

`witness_authored` — the bug is unit-catchable, so the e2e is replaceable. The observable (cancel aborts the running request) is discriminable at the hook level with a deterministic spy assertion (no timing/layout/routing dependence).

## 5. Confidence

High. The mutation faithfully reproduces the historical bug: the fix's essence was making the cancel handler actually terminate the in-flight request instead of being a no-op (`return null`), and the mutation restores that exact no-op. The witness isolates precisely that seam — clean code calls `abortRef.current()` (the stored `action.abort`), the mutant does not — and discriminates cleanly (1 vs 0 calls), with the mutation left in the worktree and the added spec alongside it.