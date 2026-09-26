# Hole-closer report — metabase#61521 (FE)

_Verbatim report from the unit-test-authoring agent (a390cc8ae893990f2)._

---

Done. The coverage hole is closed with a targeted jest integration test.

## What I did

Added one test to `frontend/src/metabase/visualizer/visualizations/cartesian.unit.spec.ts` (in the `combineWithCartesianChart` describe block) that exercises the integration point directly: it passes a `vizSettings` arg containing `column_settings` keyed to the incoming card's metric column, then asserts the result's `column_settings` are remapped onto the new `COLUMN_N` ref. `cartesian.ts` was left unchanged (restored after bug-injection check).

### (1) New test code

```ts
it("should remap the incoming card's column_settings onto the new column refs (metabase#61521)", () => {
  const settings = {
    "graph.metrics": ["COLUMN_1"],
    "graph.dimensions": ["COLUMN_2"],
  };
  const state: VisualizerVizDefinitionWithColumns = {
    display: "line",
    columns: [
      createMockNumericColumn({ name: "COLUMN_1", display_name: "Count" }),
      createMockDatetimeColumn({ name: "COLUMN_2", display_name: "Created At" }),
    ],
    columnValuesMapping: {
      COLUMN_1: [{ sourceId: "card:1", name: "COLUMN_1", originalName: "Count" }],
      COLUMN_2: [{ sourceId: "card:1", name: "COLUMN_2", originalName: "Created At" }],
    },
    settings,
  };

  // Incoming metric that will become COLUMN_3 once combined.
  const newMetricColumn = createMockNumericColumn({ name: "AVG", display_name: "Average" });
  const newDimensionColumn = createMockDatetimeColumn({ name: "DATE", display_name: "Date" });

  // The second datasource's viz settings carry per-metric formatting keyed
  // to its own column name ("AVG"). After combining it must survive under
  // the remapped COLUMN_3 key, not the original AVG key.
  const vizSettings = createMockVisualizationSettings({
    "graph.dimensions": ["DATE"],
    "graph.metrics": ["AVG"],
    column_settings: {
      '["name","AVG"]': { number_style: "percent" },
    },
  });

  const nextState = _.clone(state);
  combineWithCartesianChart(
    nextState,
    settings,
    createMockDataset({ data: { cols: [newMetricColumn, newDimensionColumn] } }),
    createDataSource("card", 2, "Card 2"),
    vizSettings,
  );

  expect(nextState.settings["graph.metrics"]).toEqual(["COLUMN_1", "COLUMN_3"]);
  // The percent formatting is preserved, remapped onto the new COLUMN_3 ref.
  expect(nextState.settings.column_settings).toEqual({
    '["name","COLUMN_3"]': { number_style: "percent" },
  });
});
```

### (2) Clean HEAD: PASS
`Tests: 37 skipped, 1 passed, 38 total`

### (3) Bug reintroduced: FAIL (clean assertion failure)
Deleting the `if (vizSettings && vizSettings.column_settings) { ... updateVizSettingsWithRefs ... }` block yields:
```
● cartesian › combineWithCartesianChart › should remap the incoming card's column_settings onto the new column refs (metabase#61521)
  expect(received).toEqual(expected)
  Expected: {"[\"name\",\"COLUMN_3\"]": {"number_style": "percent"}}
  Received: undefined
  > 944 | expect(nextState.settings.column_settings).toEqual({...})
Tests: 1 failed, 37 skipped, 38 total
```
The failing assertion is the `column_settings` deep-equality check (`Received: undefined` — the remap never ran). `cartesian.ts` was restored afterward and the test re-verified as passing.

### (4) Confidence
High. The test mirrors the e2e scenario in commit `8bd9ea4b` (percent formatting on a metric that survives adding a second datasource), asserts at the true integration point (the combine function applying the helper, not the isolated helper), and fails cleanly as an assertion — not a type/throw error — exactly when the remap block is removed. The `AVG → COLUMN_3` remapping and the `["name","COLUMN_3"]` key shape both match the production `updateVizSettingsWithRefs` behavior.

### (5) Caveats
- The `combineWithCartesianChart` signature dropped its old `datasets` param (was arg 3) after commit `8bd9ea4b`; the current call order is `(state, settings, dataset, dataSource, vizSettings)`, which my test follows.
- The test only covers the metric-formatting path (the reported bug). Dimension-keyed `column_settings` and the recursive key-remap in nested objects are covered by the helper's own spec, not re-asserted here — intentionally minimal per the task.
