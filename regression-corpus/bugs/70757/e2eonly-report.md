Task complete. The mutation is in the worktree and the witness spec is added.

## Report

### 1. git diff (product mutation)
Semantic revert of fix `8de615a6` in `frontend/src/embedding-sdk-bundle/components/private/SdkQuestion/components/DownloadWidget/DownloadWidget.tsx`: removed the `getComputedSettingsForSeries` import, the `visualizationSettings` `useMemo`, and the `visualizationSettings` key passed to `useDownloadData`. (`useMemo` remains, still used for `params`.) The SDK `DownloadWidget` now hands no visualization settings to the download path, so an ad-hoc pivot download sends `visualization_settings: {}` — the pre-fix bug.

### 2. Witness
Added `frontend/src/embedding-sdk-bundle/components/private/SdkQuestion/components/DownloadWidget/DownloadWidget.unit.spec.tsx`.

It renders `DownloadWidget` with mocked `useSdkQuestionContext`/`useEmbeddingEntityContext` supplying a real ad-hoc pivot `Question` (display `"pivot"`, two breakout cols + one aggregation) and its `Dataset`. It stubs `QuestionDownloadWidget` and spies on `useDownloadData`, then asserts the params object passed to `useDownloadData` carries a computed `visualizationSettings` containing `pivot_table.column_split`. `getComputedSettingsForSeries` runs for real (`registerVisualizations()` called), so the spy captures exactly what the mutation removes.

Oracle command:
`bun run test-unit-keep-cljs frontend/src/embedding-sdk-bundle/components/private/SdkQuestion/components/DownloadWidget/DownloadWidget.unit.spec.tsx`

- PASS on clean HEAD (1 passed) — `visualizationSettings["pivot_table.column_split"]` is defined.
- FAIL on mutant — `expect(passedParams.visualizationSettings).toBeDefined()` → `Received: undefined` (clean assertion failure, not a compile error).

### 3. Bug summary
In the SDK, downloading an ad-hoc (unsaved) pivot table as CSV produced a blank/empty CSV. The download hits `POST /api/dataset/csv` via `getAdHocQuestionParams`, whose body includes `visualization_settings`. Without the widget computing and passing pivot settings, `pivot_table.column_split` was absent, so the backend couldn't pivot the results and returned an empty CSV (only header / no rows). The shipped e2e drives the SDK iframe embed, builds an ad-hoc pivot, downloads CSV, and asserts the response is non-empty and parseable.

### 4. Outcome
`witness_authored` — the bug is unit-catchable at the seam where `DownloadWidget` computes and forwards visualization settings, so the e2e is replaceable by this jest unit test.

### 5. Confidence
High. The mutation is a faithful, minimal semantic revert of exactly the three lines the fix commit added (the only product change). The witness targets the mutated seam directly — it asserts the presence of the computed pivot `column_split` that the fix restored and the mutation removes — and it discriminates cleanly (defined vs. undefined) across clean/mutant with real `getComputedSettingsForSeries` computation. The downstream body-building (`getDatasetParams` → `visualization_settings`) is already covered by existing `downloads.unit.spec.ts`, so asserting on the argument handed to `useDownloadData` is the correct unit-level boundary for this specific mutation.