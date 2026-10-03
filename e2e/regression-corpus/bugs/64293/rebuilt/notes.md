# metabase#64293: live

## Where the code moved
The fix (070963f9f9f, PR #64521 "Allow run-query overlay when query result has missing-required-parameter error")
edited `frontend/src/metabase/query_builder/components/QueryVisualization.jsx` and added
`missingRequiredParameter` to `metabase/lib/errors/server-error-types.ts`. At HEAD the component is
`frontend/src/metabase/querying/components/QueryVisualization/QueryVisualization.tsx`. The `hidden=` expression
has become a named `isDirtyStateShown` predicate. The constant now lives in
`frontend/src/metabase/utils/errors/server-error-types.ts`. July's patch conflicts only because the file's imports
changed since then (`useSelector`, `Title` and the whitelabel selector are gone and `prefetchVisualizationComponent` is new).
The predicate itself is unchanged.

## Mutant
I dropped `|| result?.error_type === SERVER_ERROR_TYPES.missingRequiredParameter` from `isDirtyStateShown`, along with
the import that becomes unused. That is the exact inverse of the fix. With the change, any result error hides the
dirty-state overlay. `VisualizationDirtyState.handleClick` returns early when `hidden`, so after the user fills in
the required parameter, clicking the run overlay does nothing. That is the bug statement, and it's what the deleted
e2e test covers: type `NY{enter}`, click `runButtonOverlay()`, expect NY rows.

## Oracle
The spec isn't on master. I took it from July's `witness.patch`, which is identical to the file on branch
`regression-corpus-v2` (commit 1d26e58e9f0). I made two changes: `createMockState` now comes from
`__support__/state`, because `metabase/redux/store/mocks` no longer exists, and I removed the explanatory comment
block and the unused `setupUserMetabotPermissionsEndpoint` call. It renders `QueryVisualization` with a native card and
`result = {error, error_type: "missing-required-parameter"}`, plus `isResultDirty`, `isRunnable` and
`isNativeEditorOpen={false}`. Then it clicks `run-button-overlay` and asserts that `runQuestionQuery` was called once.

Clean HEAD:
    PASS core .../QueryVisualization.dirty-overlay.unit.spec.tsx
      ✓ shows a runnable overlay for a missing-required-parameter error (157 ms)
Mutant:
    ✕ shows a runnable overlay for a missing-required-parameter error (125 ms)
    expect(jest.fn()).toHaveBeenCalledTimes(expected)
    Expected number of calls: 1 / Received number of calls: 0

To check the mutant loads, I also ran `VisualizationResult.unit.spec.tsx` and
`QueryBuilder.visualization-rerender.unit.spec.tsx` on the mutant. All 9 tests in them passed.

## Adversarial check
The failure is an assertion on a call count, not a render error. The component rendered, and `getByTestId` found
the overlay, because it's always mounted and only toggled by `hidden`. The only input that changes between clean and
mutant is the `error_type` clause, and every other conjunct is pinned true by the props. jsdom ignores CSS
`pointer-events`, so the test can't pass or fail because of the `OverlayHidden` class. The gate is the JS
`if (!hidden)` in `handleClick`.

## Variants
- variant-1 (kill): compares `result?.error`, the message string, instead of `error_type`.
- variant-2 (survive): the constant's value is misspelt as `"missing-required-parameters"`. The oracle survives
  because it builds its input from `SERVER_ERROR_TYPES.missingRequiredParameter` and not from the backend's wire
  string, so a drift between the FE constant and the backend isn't caught. Using the literal
  `"missing-required-parameter"` in the spec would kill this variant.
- variant-3 (survive): drops `isResultDirty` from the predicate. The oracle has no negative case, like a fresh result
  or a different error type that should keep the overlay hidden.

## Gotchas
- `git clean -fd -- frontend` in the restore step also deletes the untracked witness spec. Re-apply `witness.patch`
  after every restore.
- No cljs involved. `target` is a symlink to `/private/tmp/metabase-corpus-fresh/target` and wasn't touched.
