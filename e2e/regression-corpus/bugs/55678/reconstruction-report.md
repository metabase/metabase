# Reconstruction report — metabase#55678 (FE, partial/all_specs_gone bucket)

_Verbatim report (a6280c90e2b0d1e0e)._

---

Reconstruction succeeded. Report below.

## Report

**(1) `git diff`** — one product file, `frontend/src/metabase/parameters/utils/mapping-options.ts`, function `getMappingOptionByTarget`. Semantic revert (not `git apply -R`): replaced the fix's stage-aware lookup — which reads `stage-number` from the target, guards `stageIndex >= stageCount`, and filters both columns *and* mapping options to that single stage — with the pre-fix loop that iterates over *all* stage indexes, ignores `stage-number`, and matches against the unfiltered `mappingOptions`. Also removed the now-unused `getStageIndexFromTarget` helper. (Full diff shown above.)

**(2) Oracle used** — `frontend/src/metabase/parameters/utils/mapping-options.unit.spec.tsx` (the shipped `.unit.spec.js` was migrated to this `.tsx`; both fix-added tests survived the migration).
- Baseline: `Tests: 30 passed, 30 total`
- Reconstructed: `Tests: 2 failed, 28 passed, 30 total`

The other listed oracle, `query.unit.spec.ts` (targeting `query.ts`'s `applyParameter` guard), survived but **drifted non-discriminating**: its `#55678` test now builds a 2-stage query with `stageIndex=1` (< `stageCount`=2), so the `stageIndex >= Lib.stageCount(query)` guard never fires — removing that guard left the test passing (49/49). Hence I selected the mapping-options spec, whose two fix-added assertions remain discriminating.

**(3) failure_shape** — Exactly the two fix-added tests fail, both on-topic:
- `should not confuse columns from different stages`: expected `mappingOptions[1]` (stage 1), got `mappingOptions[0]` (stage 0) — `toBe` mismatch on `stage-number` 1 vs 0.
- `should ignore targets with invalid stage index`: expected `undefined`, got the `stage-number: 0` option — `toBeUndefined` failure.

**(4) confidence + adversarial** — High. The two failures map one-to-one onto the fix's added assertions and their messages describe precisely the pre-fix defect (cross-stage column confusion; out-of-range stage not ignored). The revert is surgical: 28 unrelated tests in the same suite still pass, confirming no collateral breakage. `isStructuredDimensionTarget` import remains used (line 300), so the file still compiles.

**(5) ambiguity** — Minor: task framing pointed at the `query.ts` guard first, but that path's surviving test had drifted out of discriminating range; the genuinely discriminating surviving assertions live in the migrated `mapping-options.unit.spec.tsx` against `mapping-options.ts`. No `reconstruction_failed`.
