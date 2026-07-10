# Reconstruction report — metabase#47757 (FE)

_Verbatim report (afb7be37edd05bc33)._

---

Reconstruction succeeded. The bug behavior for metabase#47757 has been reintroduced with a minimal, one-line semantic revert.

## 1. Diff
```diff
 frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.ts
@@ applyXAxisTransformations
   return (datum) => {
     const transformedRecord = { ...datum };
-    transformedRecord[X_AXIS_RAW_VALUE_DATA_KEY] = datum[X_AXIS_DATA_KEY];
     transformedRecord[X_AXIS_DATA_KEY] = xAxisTransformFn(
       datum[X_AXIS_DATA_KEY],
     );
     return transformedRecord;
   };
```
(1 file, 1 deletion; `X_AXIS_RAW_VALUE_DATA_KEY` import now unused but harmless to the babel-jest oracle.)

## 2. Oracle results
- Oracle spec: `frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.unit.spec.ts`
- Baseline: `Tests: 31 passed, 31 total`
- Reconstructed: `Tests: 9 failed, 22 passed, 31 total`

## 3. Failure shape
Genuine assertion failures (`expect(result).toEqual([...])`). Received objects are missing the ` _x_raw` (`X_AXIS_RAW_VALUE_DATA_KEY`) property that the fix-added assertions expect, e.g.:
```
    -     " _x_raw": "2026-07-10T05:59:43.318Z",
```
No compile/import/arity errors — clean value mismatches across the 9 `applyVisualizationSettingsDataTransformations` tests that assert the raw x-axis value is preserved.

## 4. Confidence + adversarial reasoning
High confidence.
- This is a semantic revert, not `git apply -R`: I kept the fix's new function shape (`applyXAxisTransformations`) and only removed the raw-value storage — the exact behavioral contribution of the fix. The pre-fix code deleted that function entirely and used `getKeyBasedDatasetTransform`, so this is not a literal patch reversal.
- It reintroduces the actual bug: without stashing the untransformed x value, interpolated data points lose their original x-axis value, so tooltips on interpolated points show the ECharts-transformed (timezone-adjusted) value instead of the real one — precisely bug #47757 ("invalid tooltip on interpolated values").
- Baseline passed 31/31 in the same cwd/symlink setup, so the failures are attributable to my change, not a harness misconfiguration.
- Failures are assertion-shaped, not honest-negative shapes (no deletion/arity/moved-target/dead-target).

## 5. Ambiguity
Minor: the fix bundled two additions — `INDEX_KEY` (an index-tracking refactor) and `X_AXIS_RAW_VALUE_DATA_KEY` (the tooltip fix). I targeted only `X_AXIS_RAW_VALUE_DATA_KEY` because it is the semantic root cause of the interpolated-tooltip bug named in the commit. This is sufficient to fail the suite (9 tests). The `INDEX_KEY` assertions still pass, which is correct — they belong to the supporting refactor, not the bug itself.
