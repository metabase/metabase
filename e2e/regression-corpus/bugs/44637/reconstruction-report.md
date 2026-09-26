I have completed the investigation. No source edits were made; this is an honest negative.

## Reconstruction report: metabase#44637

**Fix commit** `e0381e9b` ("Fix FE crash for line/area/bar charts with no data", PR #44769) had two kinds of change:
- **Core runtime fix**: `getTimeseriesXDomain` in `frontend/src/metabase/query_builder/selectors.js` (now `selectors.ts:826`) — guards against empty/non-array `xValues` before calling `d3.extent`, returning `null` instead of `[undefined, undefined]`.
- **Defensive type-hardening**: made `Database.features` optional (`features?`) and added `?.` optional-chaining at 5 call sites (`ImpersonationModalView.tsx`, `helper-text-strings.ts`, `UploadSettings/utils.ts`, `metabot/utils.ts`, and a `?.filter` in the `ModelDetailPage.unit.spec.tsx` test file itself).

**(1) git diff** — none. No semantic revert was applied; no surviving discriminating jest spec exists to gate.

**(2) Oracle / baseline** — The shipped regression test is a **Cypress e2e** spec (`reproductions-3.cy.spec.js`, "issue 44637"), not jest — out of the jest oracle's scope. The named jest candidate `frontend/src/metabase/models/containers/ModelDetailPage/ModelDetailPage.unit.spec.tsx` **no longer exists**: the entire old `models/containers/ModelDetailPage` (product + spec) was deleted in the "Deets in Sheets" refactor (commit `1ba4aba2d09` and neighbors) and replaced by `frontend/src/metabase/detail-view/pages/ModelDetailPage/ModelDetailPage.tsx`, which has no unit spec and does not reference `features`. Oracle run against the old path returns `0 matches`.

**(3) failure_shape** — n/a (no reconstructable failing jest spec).

**(4) confidence + adversarial** — High confidence this is a true negative. Adversarially checked every alternative jest anchor:
- `getTimeseriesXDomain` (the real crash): `selectors.unit.spec.ts` does **not** cover it; no jest spec exercises this selector anywhere.
- All 5 optional-chaining guards are **non-discriminating** in jest: `createMockDatabase` defaults `features: COMMON_DATABASE_FEATURES`, and every relevant spec (`ImpersonationModal.unit.spec.tsx`, `UploadSettings/utils.unit.spec.ts`) either uses that default or sets `features: [...]` explicitly — none passes `features: undefined`, so reverting `?.` → `.` would not throw. `helper-text-strings.ts` and the old `metabot/utils.ts` (`canUseMetabotOnDatabase`, now deleted) have no covering jest spec.
- Even in its original form, the `ModelDetailPage` candidate's change was a test-file type-accommodation (`features?.filter`), not a runtime assertion of the crash — reverting the product code would never have failed it.

**(5) reconstruction_failed**
- **category**: Runtime crash in a Redux QB selector (`getTimeseriesXDomain`) for empty-result timeseries charts; the shipped regression coverage is a full-render **Cypress e2e** test, and the bundled jest-visible edits are pure defensive type-hardening that no unit test discriminates.
- **reconstructable?**: **Partially / feasible-but-not-from-a-surviving-spec.** A *new* jest unit test on the exported `getTimeseriesXDomain` selector could discriminate (old returns `[undefined, undefined]` for empty `xValues`, new returns `null`), but it requires heavy synthetic `state.qb` mocking to drive the `getIsTimeseries` / `getTimeseriesXValues` / `getTransformedSeries` / `getVisualizationSettings` chain, and none exists today. The authentic regression signal lives in Cypress, outside the jest oracle.