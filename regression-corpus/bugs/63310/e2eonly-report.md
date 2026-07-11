Done. Final worktree state: product mutation + witness both applied, witness fails on the mutant and passes on clean HEAD.

## 1. git diff (product mutation)

`frontend/src/metabase/dashboard/components/Dashboard/components/Grid.tsx` — the current code (post-refactor #66262) derived `canCreateQuestions` from cheap user selectors (`canUserCreateQueries` / `canUserCreateNativeQueries`), which never hit the network. The mutation reintroduces the pre-fix behavior: an **unconditional** `useListDatabasesQuery()` call, deriving data-access from the response. Because the `skipToken`/user gate is gone, `GET /api/database` now fires even in a static-embedding (no logged-in user) context. `getHasDataAccess`/`getHasNativeWrite` were deleted from `selectors/data.ts` in the drift, so I inlined their equivalent predicates.

## 2. Witness

New spec: `frontend/src/metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardPage/tests/PublicOrEmbeddedDashboardPage.database-request.unit.spec.tsx`. It renders `PublicOrEmbeddedDashboardPage` via the existing embed `setup` helper (static embedding, no user), waits for `dashboard-grid`, then asserts `fetchMock.callHistory.calls("path:/api/database", { method: "GET" })` has length 0.

- Oracle command: `bun run test-unit-keep-cljs .../PublicOrEmbeddedDashboardPage.database-request.unit.spec.tsx`
- PASS on clean HEAD: 1 passed (0 calls).
- FAIL on mutant: `expect(received).toHaveLength(0)` → `Expected length: 0 / Received length: 1` (the `GET /api/database` call).

## 3. Bug summary
In a static embedded dashboard, the dashboard `Grid` component issues an unnecessary `GET /api/database` request. That endpoint is unauthorized/irrelevant for anonymous embed viewers; the e2e (metabase#63310) intercepts `/api/database` and asserts zero calls.

## 4. Outcome
`witness_authored` — the bug is unit-catchable. The observable ("does the component trigger a `GET /api/database` fetch on mount") is fully discriminable at the jsdom + fetch-mock level; no real browser, layout, or routing is required.

## 5. Confidence
High. The mutation is a faithful semantic revert of the original fix commit (814dd5c) accounting for drift: it restores the exact bug shape (unconditional list-databases query in the shared dashboard Grid) that the fix guarded against. The witness reproduces the e2e's assertion (`@getDatabases.all` length 0) at the unit level — same endpoint, same embedded render path (`Dashboard.Grid` is on `PublicOrEmbeddedDashboardPage`'s render tree), same zero-call expectation — and cleanly separates clean (pass) from mutant (fail).