# 63310: static embed dashboard calls GET /api/database

## Where the code is now
Still `frontend/src/metabase/dashboard/components/Dashboard/components/Grid.tsx`, but the fix's shape is gone.
The fix (814dd5c8005) gated `useListDatabasesQuery` on `!!getUser(state)` with `skipToken`.
Then #66262 (7e31d3b5794, "Tables in collections") dropped the query entirely: `canCreateQuestions` now comes from
`canUserCreateQueries` / `canUserCreateNativeQueries` (user selectors, no network). Since then #79357 moved them
to `metabase/current-user`, which is why July's patch conflicts at the import hunk.

## Mutant
Replace the two user selectors with an unconditional `useListDatabasesQuery()` and derive data access from the
response, the pre-fix code at 814dd5c8005^ with the deleted `getHasDataAccess` / `getHasNativeWrite` helpers inlined.
This is July's mutant rebased onto the new imports. There's no one-line version because the guard it would flip
no longer exists; bringing the request back is the bug. Loads fine: DashboardApp.unit.spec passes on the mutant.

## Oracle (July witness, adapted)
New file `PublicOrEmbeddedDashboardPage.database-request.unit.spec.tsx`, plus a `currentUser` option on the
shared `tests/setup.tsx` (defaults to `createMockUser()`, so other specs are unchanged). Changes from July:
- Renders with `currentUser: null`. `createMockState()` seeds a logged-in user by default, so July's witness was
  not an anonymous viewer: it would have failed against the fix commit's own guard, and variant 1 survived it.
  With `null`, the fix-commit guard shape passes (checked) and variant 1 is killed.
- Matches `/api/database` and `/api/embed/database`. `usePublicEndpoints` installs the static-embed request
  rewrite in `useMount` on the module-global `PLUGIN_API`. The first test in a file sees `/api/database`; any
  later test sees `/api/embed/database`. I checked this with a throwaway two-test copy: both runs caught the mutant.
- Dropped July's inline comment.

Clean HEAD (the witness and all 3 sibling PublicOrEmbeddedDashboardPage specs, 23 tests):
```
PASS ...database-request.unit.spec.tsx
  ✓ should not call `GET /api/database` in a static embedding (metabase#63310)
```
Mutant:
```
✕ should not call `GET /api/database` in a static embedding (metabase#63310)
  expect(received).toHaveLength(expected)  Expected length: 0  Received length: 1
  > 25 |     expect(listDatabaseCalls).toHaveLength(0);
```

## Adversarial check
The failure is the final `toHaveLength(0)`, reached after `findByTestId("dashboard-grid")` succeeds, so the page
rendered normally. The received call is `GET http://localhost/api/database` (route `database-list`, 200 from
the setup's `setupDatabasesEndpoints`). No render error, no timeout. The only difference between clean and mutant
is whether the Grid fires that request.

## Variants
- variant-1: fix guard with the condition inverted (fetch only when logged out). kill.
- variant-2: fix guard with `getUser(state) !== undefined`. getUser returns null, so it always fetches. kill.
- variant-3: `hasDataAccess && hasNativeWrite` in today's selector code, no request involved. survive (expected:
  it's an empty-state prompt bug that this oracle can't see).

## Trip hazards
- In `PublicOrEmbeddedDashboardPage.common.unit.spec.tsx` the mutant fails 7 tests with "Test completed with
  unmocked routes: GET /api/embed/database". That's an afterEach error, not an assertion, so don't use it as the oracle.
- Real product note: the request fires from Grid's effect before the parent's `useMount` installs the rewrite,
  so a fresh page load hits `/api/database`. This matches the e2e intercept.
- No cljs involved; `target` symlink untouched.
