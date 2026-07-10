Both changes are in the worktree. Task complete.

## Report

**Outcome: `witness_authored`** — the bug is unit-catchable; the e2e is replaceable by a jest unit test.

### 1. git diff (product mutation) — the semantic revert
The fix commit's product change (`frontend/src/metabase/api/session.ts`, guard `response.data && typeof response.data === "object"`) has since been refactored into the shared helper `frontend/src/metabase/api/utils/lifecycle.ts` (`handleQueryFulfilled`). I reintroduced the bug at that current seam:

```diff
--- a/frontend/src/metabase/api/utils/lifecycle.ts
+++ b/frontend/src/metabase/api/utils/lifecycle.ts
@@ -19,7 +19,7 @@ export async function handleQueryFulfilled<T>(
   try {
     const { data } = await queryFulfilled;
-    if (data != null && typeof data == "object") {
+    if (data != null) {
       handleSuccess(data);
     }
```

Dropping the `typeof data == "object"` check restores the pre-fix behavior: a truthy HTML string passes the guard and is forwarded to the success handler.

### 2. Witness
New spec: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a84d7c98b67c588fd/frontend/src/metabase/api/utils/lifecycle.unit.spec.ts` (3 tests; the discriminating one asserts `handleSuccess` is NOT called when the query resolves with the exact HTML body from the e2e repro).

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/api/utils/lifecycle.unit.spec.ts`
- PASS on clean HEAD: all 3 pass.
- FAIL on mutant: `does not call handleSuccess when the response is an HTML string from a redirect (metabase#62501)` fails with `expect(jest.fn()).not.toHaveBeenCalled() — Received number of calls: 1` (called with the HTML string).

### 3. Bug summary
When `/api/session/properties` returns an HTML string body (the backend 302-redirects the request and the resolved response `data` is a string rather than the settings object), the un-guarded code forwards that string into the success path — `loadSettings(data)` / `MetabaseSettings.setAll(data)`. On a public dashboard that corrupts the settings store instead of ignoring the bogus response, so the dashboard fails to render. The e2e intercepts `/api/session/properties` with an HTML body and asserts the public dashboard ("Test Dashboard") still renders inside `embed-frame`.

### 4. Outcome
`witness_authored`. The fix logic is a pure predicate on the response payload sitting behind an exported function (`handleQueryFulfilled`), so a jest unit test can drive it directly with a resolved promise and observe whether the success callback fires — no render, routing, or browser needed.

### 5. Confidence
High. The mutation is the exact inverse of the shipped guard (relocated to where the code drifted), and the witness discriminates on the same HTML payload the e2e uses, asserting the precise observable effect (success handler invocation with a string). One harness note: the worktree's `frontend/test/jest-setup.js` (newer than the shared checkout) imports `@stardazed/streams-text-encoding`, which was absent from the stale shared `node_modules`; I restored it by copying the package from bun's global cache (`1.0.2`) into the shared `node_modules` — a build-artifact fix only, no source touched.