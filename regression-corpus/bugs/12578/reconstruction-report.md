The reconstruction is complete and the diff is left in the worktree. Here is the report.

---

## 1. git diff (semantic revert)

`frontend/src/metabase/dashboard/reducers-typed.ts` — `loadingDashCards` reducer, `fetchDashboardCardDataAction` handler:

```diff
       .addCase(fetchDashboardCardDataAction, (state, action) => {
-        const { currentTime, loadingIds } = action.payload;
+        const { currentTime, dashcardIds } = action.payload as any;
+        const loadingIds = Array.isArray(dashcardIds) ? dashcardIds : [];
         return {
           ...state,
           loadingIds,
```

This reintroduces the pre-fix reducer behavior. The fix (commit 6548584, PR #32754) renamed the `FETCH_DASHBOARD_CARD_DATA` payload key from `dashcardIds` to `loadingIds` (so the reducer could consume the accumulated/filtered loading-id set that the `fetchDashboardCardData` thunk now builds on auto-refresh). The pre-fix code read `payload.dashcardIds` behind an `Array.isArray(...)? : []` guard. Since the current thunk (and the spec) dispatch `loadingIds`, reading the old `dashcardIds` key resolves to `undefined` → guard yields `[]`, so loading-state tracking silently collapses to empty.

## 2. Oracle

- Spec: `frontend/src/metabase/dashboard/reducers.unit.spec.ts` (relocated descendant of the shipped `reducers.unit.spec.js`; product logic moved `reducers.js` → `reducers-typed.ts`).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/reducers.unit.spec.ts`
- Baseline (clean HEAD): Tests 18 passed / 18 total.
- Reconstructed (mutation applied): Tests 1 failed / 17 passed / 18 total.

## 3. failure_shape

Failing test: `dashboard reducers › Should accurately describe loading state › should change to running when loading cards`. Clean value mismatch on `toMatchObject` of `loadingDashCards`:
- Expected: `loadingIds: [1, 2, 3]`, `loadingStatus: "running"`, `startTime: Any<Number>`
- Received: `loadingIds: []`, `loadingStatus: "complete"`, `startTime: null`

No compile/import error — a pure DOM/value assertion flip.

## 4. Confidence + adversarial

The failure isolates exactly the reverted behavior. Only the "running" test flips; the sibling tests stay green and confirm it is not a blunt break:
- "should be complete when the dashboard doesn't have cards to load" passes — it dispatches `loadingIds: []`, which under both old and new code yields an empty set → `complete`, so it cannot distinguish the mutation (expected; it is the empty-case control).
- "should be complete when loading finishes", "should not have duplicated elements in loadingIds on pending", and the cancellation tests all pass — they exercise `fetchCardDataAction.fulfilled` / `cancelFetchCardData` handlers, untouched by this edit.

The single discriminating assertion is the non-empty loading path, precisely the payload-key contract the fix established.

## 5. Outcome

`kill` — via the relocated oracle (`reducers.unit.spec.js` → `reducers.unit.spec.ts`; reducer product code `reducers.js` → `reducers-typed.ts`, action `FETCH_DASHBOARD_CARD_DATA` → `fetchDashboardCardDataAction`). The surviving jest spec discriminates the reducer half of the fix (the `dashcardIds` → `loadingIds` payload contract). 

Note: the fix's *core* race-condition remedy (skip refetching already-loading dashcards when `isRefreshing`, in `data-fetching.ts`) is guarded only by the shipped Cypress e2e (`...-one-at-a-time-when-auto-refreshing.cy.spec.js`) and is not jest-covered — but the reducer payload change that the fix also shipped is a genuine, jest-discriminating behavioral change, so this target is a clean kill rather than cypress_only. The diff is left in the worktree for capture.