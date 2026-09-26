# 5334: clicking the pie chart "Other" slice opens no drill-through menu

Status: live. Base `8317274709c`. Mutant is 4 lines in one frontend file; the jest spec already on master kills it with an assertion failure.

## Where the code is now
The click handler hasn't moved: `handleClick` in `frontend/src/metabase/visualizations/visualizations/PieChart/use-chart-events.ts`. July's inverse patch no longer applies because the import block changed underneath it: the slice-tree types and helpers (`PieChartModel`, `SliceTreeNode`, `getSliceTreeNodesFromPath`, ...) now come from `metabase/viz-core` (#80786 "Create the viz-core module", #79684). The function bodies the fix added (`hasObjectDimensionValue`, `getOtherSliceDimensionValue`, `getClickObjectDimensions`) are unchanged.

## The mutant
The fix removed an early return right after the clicked slice node is looked up (`if (sliceTreeNode.isOther) { return; }`). The mutant puts it back. With it back, an Other slice click never builds a click object and never calls `onVisualizationClick`, so no drill menu opens and you can't reach "See these records". That matches `bug.statement`. The other two parts of the fix (the lib `drill-filter` `:in` branch in cljc, and `shouldHideDrill` in `query-drill.ts`) are left in place; they only matter once the click gets through. That also avoids the July problem where reverting `query-drill.ts` turned its spec into an import error.

## Oracle (jest, on master)
`use-chart-events.unit.spec.ts::useChartEvents emits grouped dimensions when the Other slice is clicked (#5334)`. Clean: passes. Mutant: `expect(jest.fn()).toHaveBeenCalledWith(...)  Number of calls: 0`. `PieChart/definition.unit.spec.ts` passed alongside it on the mutant, so the module loads.

## Adversarial check
The spec calls the hook with `renderHook` and fires the click handler directly. Nothing renders, so the failure can't come from a render crash. The handler returns normally; the only failing check is zero calls. The mutant adds a single branch that fires only when `isOther` is set.

## Variations
- variant-1: **kill**. `getClickObjectDimensions` drops its Other branch, so the dimension value is the slice's own key instead of `["Gizmo", "Doohickey"]`.
- variant-2: **survive**. `hasObjectDimensionValue` drops its Other branch. The spec's Other children are plain strings, so nothing checks this.
- variant-3 (backend cljc): **survives jest, killed by deftest**. In `drill-filter`, a grouped value produces `(= column (first values))` instead of `:in`. The jest oracle never reaches lib code (the click callback is a mock). `metabase.lib.drill-thru.underlying-records-test/chart-other-slice-click-test` passes clean and fails with an assertion (expected `:in` with "Gadget" and "Doohickey", got `=` with only "Gadget"). Run with `./bin/test-agent` from the worktree, 31 tests, 1 failure, 0 errors.

## Gotchas
- No cljs rebuild. The mutant and frontend variants are TS only; variant-3 was run through the JVM deftest only.
- The spec's click event has `name` but no `dataIndex`. A variant restoring the old `event.dataIndex == null` guard would be killed only because the mock leaves `dataIndex` out, so it wasn't used.
- `query-drill.unit.spec.ts` covers the "only See these records for Other" half of the fix. Separate bug; doesn't react to this mutant.
