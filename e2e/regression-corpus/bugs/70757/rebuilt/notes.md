# 70757: empty CSV for ad-hoc pivot downloads in the SDK

## Where the code is now
Same file as the fix (8de615a69d6): `frontend/src/embedding-sdk-bundle/components/private/SdkQuestion/components/DownloadWidget/DownloadWidget.tsx`.
Two things moved around it, which is why July's patch conflicts:
- `getComputedSettingsForSeries` is now imported from `metabase/viz-core` (was `metabase/visualizations/lib/settings/visualization`).
- `useDownloadData` lives in `metabase/common/components/QuestionDownloadWidget` and the widget also passes `params` (guest-embed filters), so the call-site context differs.

## Mutant
Semantic revert of the three pieces the fix added: the `getComputedSettingsForSeries` import, the `visualizationSettings` useMemo, and the `visualizationSettings` key on `useDownloadData`. `useMemo` stays imported (still used for `params`). The mutant file lints clean.
Same bug: for an unsaved question, `getDatasetParams` routes to `getAdHocQuestionParams`, which sends `visualization_settings: visualizationSettings ?? {}` to `POST /api/dataset/csv`. With nothing passed, the body carries `{}`, there is no `pivot_table.column_split`, and the backend can't pivot, so the pivoted CSV comes back empty.

## Oracle
July's `witness.patch`, adapted. Three changes were needed:
- `registerVisualizations` is now a named export (the default-import version crashes at suite load with `_register.default is not a function`).
- It builds the card with `createMockUnsavedCard` instead of `id: undefined as any`.
- It types the mock as `UseDownloadDataParams`, so it needs no cast. The repo lint rule `metabase/no-unjustified-type-casts` rejects unexplained casts.
I also dropped July's comments. The spec lints and passes prettier.
It renders the real `DownloadWidget` with a mocked SDK question context: an unsaved `display: "pivot"` card, two breakout columns and one aggregation. It stubs `QuestionDownloadWidget`/`useDownloadData`, runs `getComputedSettingsForSeries` for real, and asserts on the params handed to `useDownloadData`.

Clean:
```
PASS sdk .../DownloadWidget.unit.spec.tsx
  ✓ passes computed pivot visualization settings to the download request (metabase#70757)
```
Mutant:
```
✕ passes computed pivot visualization settings to the download request (metabase#70757)
  expect(received).toBeDefined()
  Received: undefined
  > expect(passedParams.visualizationSettings).toBeDefined();
```

## Adversarial check
- It's not a render crash: `expect(useDownloadDataMock).toHaveBeenCalledTimes(1)` passes on the mutant, so the component mounted and called the hook. The failure is the next line, on the missing key.
- The second assertion, on `pivot_table.column_split`, is load-bearing. Variant 1 (stored `question.settings()` instead of computed settings) passes the first assertion (`{}` is defined) and fails the second. So the test checks for computed pivot defaults, not just "some object".
- Scope limit: the oracle stops at the `useDownloadData` boundary. Anything downstream (the hook forwarding the key, `getAdHocQuestionParams` building the body, the backend pivot) is invisible to it. `downloads.unit.spec.ts` has no `visualization_settings` assertion either, so the downstream wiring is unguarded (variant 2 survives).

## Variants
- variant-1: `useMemo(() => question.settings(), [question])` in place of the computed settings. Result: kill (on the column_split assertion).
- variant-2: `use-download-data.ts` drops `visualizationSettings` from the `downloadQueryResults` call. Result: survive (the hook is mocked).
- variant-3: memo deps `[question]` instead of `[question, result]` (stale settings when the result changes). Result: survive (single render).

## Gotchas
- The worktree `target` is a symlink to `/private/tmp/metabase-corpus-fresh/target`. No cljs was touched, so no rebuild was needed.
- The spec runs in the `sdk` jest project. `--runTestsByPath` picks that up automatically.
- Restoring with `git clean -fd -- frontend` also deletes the untracked witness spec. Between variants I only ran `git checkout -- .` and did the full clean at the end.
