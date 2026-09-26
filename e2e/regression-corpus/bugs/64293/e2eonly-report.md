Both the product mutation and the witness spec are in the worktree. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert applied to `frontend/src/metabase/querying/components/QueryVisualization/QueryVisualization.tsx` (the code drifted from the fix commit's `.jsx` — it was converted to TS and relocated from `query_builder/components` to `querying/components/QueryVisualization`):

```diff
-import { SERVER_ERROR_TYPES } from "metabase/utils/errors";
 ...
-    (result?.error == null ||
-      isDirtyStateShownForError ||
-      result?.error_type === SERVER_ERROR_TYPES.missingRequiredParameter);
+    (result?.error == null || isDirtyStateShownForError);
```

This is the load-bearing product change. The fix's two product files were (a) adding the `missingRequiredParameter` constant to the server-error-types map and (b) consuming it in the overlay-visibility predicate. The predicate is the behavioral seam; I reverted both the clause and its now-dead import. (The constant still exists in `server-error-types.ts` — unused now, harmless.)

### 2. Witness
Added spec: `frontend/src/metabase/querying/components/QueryVisualization/QueryVisualization.dirty-overlay.unit.spec.tsx`

It renders `<QueryVisualization>` with a native question and a `result` carrying `error_type: "missing-required-parameter"`, `isResultDirty`/`isRunnable` true, then clicks the `run-button-overlay` and asserts `runQuestionQuery` was invoked. The overlay's `onClick` handler is guarded by the `hidden` flag, which is driven directly by the reverted predicate — so a suppressed overlay swallows the click.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/querying/components/QueryVisualization/QueryVisualization.dirty-overlay.unit.spec.tsx
```
- PASS on clean HEAD: `✓ shows a runnable overlay for a missing-required-parameter error`
- FAIL on mutant: `expect(jest.fn()).toHaveBeenCalledTimes(1)` → `Received number of calls: 0`

### 3. Bug summary
When a native question has a required parameter with no value, the backend returns a result with `error_type: "missing-required-parameter"`. The reintroduced bug treats that like any other query error and suppresses the dirty-state overlay (the big clickable Run button). The user fills in the parameter but has no way to re-run — clicking where the Run button should be does nothing. The fix special-cases that error type so the overlay stays live. This is exactly what the e2e checks: type `NY{enter}` into the State field, then `runButtonOverlay().click()` runs the query.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable at the jsdom level. The observable (overlay click routes to `runQuestionQuery`) is a pure function of props and needs no real browser, layout geometry, routing, or network.

### 5. Confidence
High. The mutation is the precise inverse of the fix's predicate change, at the same decision site. The witness discriminates cleanly (clean PASS / mutant FAIL, behavioral assertion, no compile error) and exercises the same interaction the e2e does — clicking the overlay to trigger a re-run. jsdom's lack of CSS `pointer-events` doesn't confound it, because the gate is the JS `hidden` prop in `handleClick`, not CSS.