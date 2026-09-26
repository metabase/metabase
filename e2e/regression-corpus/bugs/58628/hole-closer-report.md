# Hole-closer report — metabase#58628 (FE)

_Verbatim report from the unit-test-authoring agent (aa83776aef6080720)._

---

Source restored (no diff). The task is complete.

## Report

The coverage hole is closable at the unit level. I added one targeted thunk-level test to `frontend/src/metabase/query_builder/actions/core/initializeQB.unit.spec.ts` (plus a top-of-file `import { replace } from "react-router-redux";`).

### (1) New test code

```ts
describe("notebook mode without data access (metabase#58628)", () => {
  it("redirects to the unauthorized page and bails when the user cannot create queries", async () => {
    const { card } = TEST_CASE.SAVED_STRUCTURED_QUESTION;
    const baseUrl = Urls.card(card);
    const location = getLocationForCard(card, {
      pathname: `${baseUrl}/notebook`,
    });

    const { dispatch, result } = await setup({
      card,
      location,
      hasDataPermissions: false,
    });

    // Guard fires: redirect to /unauthorized ...
    expect(dispatch).toHaveBeenCalledWith(replace(Urls.unauthorized()));
    // ... and init bails without ever dispatching INITIALIZE_QB.
    expect(result).toBeNull();
  });
});
```

It reuses the existing `setup()`/`baseSetup()` harness: `hasDataPermissions: false` seeds `createMockUserPermissions({ can_create_queries: false })` and empties the databases entity list, so `canUserCreateQueries(getState())` returns false. `result` is `null` because `baseSetup` derives it from the captured `INITIALIZE_QB` action, which the guard's early `return` prevents from ever dispatching.

### (2) Clean HEAD — PASSES
```
Test Suites: 1 passed, 1 total
Tests:       135 skipped, 1 passed, 136 total
```

### (3) Guard removed — FAILS (clean assertion failure)
```
Test Suites: 1 failed, 1 total
Tests:       1 failed, 135 skipped, 136 total
```
The failing assertion is line 1034, `expect(dispatch).toHaveBeenCalledWith(replace(Urls.unauthorized()))` — with the guard gone, init proceeds and never dispatches the `@@router/CALL_HISTORY_METHOD` / `replace("/unauthorized")` action. `initializeQB.ts` has been restored (confirmed `git diff --stat` is empty).

### (4) Confidence it faithfully guards #58628
High. The test drives exactly the code path the Cypress e2e guards: `queryBuilderMode === "notebook"` (via the `/notebook` pathname) combined with no data-creation permission, and asserts the precise production behavior — a `replace(Urls.unauthorized())` redirect (`"/unauthorized"`) plus a full bail-out (no `INITIALIZE_QB`). Removing the guard flips it to a clean failure and restoring it flips it back, so it's tightly coupled to the guard rather than incidental state.

### (5) Caveats
- The assertion depends on `react-router-redux`'s `replace` action shape (`@@router/CALL_HISTORY_METHOD`). I import the real `replace` creator (same one the source uses) rather than hard-coding the shape, so this stays robust if the internal shape changes. Note the recent facade-migration/eslint-ban commit: the source still imports `replace` from `react-router-redux` directly, so the spec import is consistent — but if a lint rule later bans `react-router-redux` in specs, this import would need to move to the `metabase/router` facade. It does not affect jest execution.
- I did not run the full 136-test suite unfiltered end-to-end (ran the targeted `-t` filter, which loads/skips the whole file cleanly), so the added import and block compile and coexist with the suite without issue.
