# Reconstruction report — metabase#52627 (FE, partial/all_specs_gone bucket)

_Verbatim report (a7ff7a415c39048a8)._

---

The product files are restored to their correct (fixed) state; the frontend tree is clean.

## Report: bug metabase#52627 — reconstruction_failed (honest negative)

**(1) git diff of reconstruction attempt.** I reverted both product files to their pre-fix (buggy) state to reconstruct the bug. Both reverts have since been rolled back (`git checkout`); frontend tree is clean. The attempted reconstruction was:
- `frontend/src/metabase/querying/parameters/utils/query.ts` — removed `Lib.ensureFilterStage` + `Lib.dropEmptyStages` from `convertParametersToMbql` (this is where the shipped `Question.ts` logic now lives).
- `frontend/src/metabase/dashboard/actions/getNewCardUrl.ts` — restored the pre-fix `ensureFilterStage` block that adds an empty stage on top of aggregations.

**(2) Oracle + baseline vs reconstructed.**
- Oracle: shipped `Question.unit.spec.js` assertion `expect(Lib.stageCount(...).toBe(1))` relocated to `frontend/src/metabase/querying/parameters/utils/query.unit.spec.ts:496` (test "should convert a question with parameters into a new question with filters"). The `_convertParametersToMbql` method became the free function `convertParametersToMbql`.
- Baseline (fixed): `Tests: 48 skipped, 1 passed`. Reconstructed (fully reverted, buggy): `Tests: 51 passed` across both `query.unit.spec.ts` and `getNewCardUrl.unit.spec.ts`. **The oracle PASSES on the buggy code — it does not discriminate.** I also ran a half-revert probe (kept `ensureFilterStage`, dropped `dropEmptyStages`) — still passed.

**(3) failure_shape.** None. No jest assertion flips. The shipped assertion's query is a plain `source-table` question; `Lib.ensureFilterStage` is a no-op on a non-aggregated query, so `stageCount` is `1` in every product variant.

**(4) Confidence + adversarial.** High confidence this is a true honest-negative. The real discriminating oracle is the E2E Cypress test added in the same commit: `issue 52627 › "should remove an empty query stage after a dashboard drill-thru (metabase#52627)"` in `e2e/test/scenarios/filters-reproductions/dashboard-filters-reproductions.cy.spec.js`. It requires the full drill pipeline (`getNewCardUrl` → `getStructuredQuestionUrlWithParameters` → `convertParametersToMbql`) with an **aggregated bar chart** (avg Total, avg Discount, breakout by month) and a Category filter mapped at **`{ "stage-number": 0 }`**. The empty stage arises only because buggy `getNewCardUrl` calls `ensureFilterStage` (adding a stage above the aggregation) while the filter lands in stage 0, leaving the new stage empty and never dropped. The unit test cannot reproduce this: `convertParametersToMbql` in isolation, when reverted, never adds a stage at all, so it yields the same `stageCount` as the fixed version regardless of query shape. Adversarial check: I verified the assertion passes on baseline, full-revert, and half-revert — three independent product states, all `1`.

**(5) reconstruction_failed.**
- **category:** E2E-only regression guard. The shipped jest assertion (`stageCount(...).toBe(1)`) is a non-discriminating supporting check for the fix's newly-introduced `ensureFilterStage`/`dropEmptyStages` in `convertParametersToMbql`; it is a no-op guard for the simple-query shape it tests. The behavioral symptom (an empty trailing query stage surviving a dashboard drill-thru of an aggregated card) is only observable through the UI-level drill flow.
- **reconstructable as jest?** Not faithfully. A jest test on `convertParametersToMbql` alone can never exhibit the empty-stage symptom (reverted function adds no stage). It *would* be possible to author a *new* integration-level jest test around `getNewCardUrl`/`getStructuredQuestionUrlWithParameters` using an aggregated card + a `stage-number: 0` param and asserting the resulting card's `stageCount` (buggy = 2, fixed = 1) — but that is a new test not present in the fix commit, requiring the fuller drill-flow mocking, and the fix's authors deliberately covered it with Cypress instead.
