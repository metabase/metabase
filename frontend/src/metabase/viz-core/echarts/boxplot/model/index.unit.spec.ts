import type { DatasetColumn } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import {
  INDEX_KEY,
  X_AXIS_DATA_KEY,
  X_AXIS_POSITION_KEY,
} from "../../cartesian/constants/dataset";

import { getBoxPlotModel } from ".";

const buildModel = (isDashboard: boolean) => {
  const dimensionColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  const metricColumn = createMockColumn({
    name: "count",
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
  });

  return getBoxPlotModel(
    [
      {
        card: createMockCard({ id: 1, display: "boxplot" }),
        data: createMockDatasetData({
          cols: [dimensionColumn, metricColumn],
          rows: [
            ["A", 1],
            ["A", 2],
            ["A", 3],
            ["A", 4],
            ["A", 100],
            ["B", -100],
            ["B", 1],
            ["B", 2],
            ["B", 3],
            ["B", 4],
          ],
        }),
      },
    ],
    createMockVisualizationSettings({
      "graph.dimensions": [dimensionColumn.name],
      "graph.metrics": [metricColumn.name],
      "graph.x_axis.scale": "ordinal",
      "graph.y_axis.scale": "linear",
      "boxplot.whisker_type": "tukey",
      column: (column: DatasetColumn) => ({ column }),
    }),
    [],
    undefined,
    isDashboard,
  );
};

describe("box plot category positions", () => {
  it("maps sparse auxiliary datasets to the box positions without changing raw data", () => {
    const model = buildModel(true);

    expect(model.xAxisModel.positions?.values).toEqual(["A", "B"]);
    expect(model.boxDataset.map((datum) => datum[X_AXIS_POSITION_KEY])).toEqual(
      [0, 1],
    );
    expect(model.outlierAbovePointsDataset).toEqual([
      expect.objectContaining({
        [X_AXIS_DATA_KEY]: "A",
        [X_AXIS_POSITION_KEY]: 0,
        [INDEX_KEY]: 4,
      }),
    ]);
    expect(model.outlierBelowPointsDataset).toEqual([
      expect.objectContaining({
        [X_AXIS_DATA_KEY]: "B",
        [X_AXIS_POSITION_KEY]: 1,
        [INDEX_KEY]: 5,
      }),
    ]);
    expect(
      model.nonOutlierPointsDataset.map((datum) => datum[X_AXIS_POSITION_KEY]),
    ).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const rawDataPoints = model.dataBySeriesAndXValue
      .get(model.seriesModels[0].dataKey)
      ?.get("B")?.rawDataPoints;
    expect(rawDataPoints).toHaveLength(5);
    expect(
      rawDataPoints?.every(({ datum }) => !(X_AXIS_POSITION_KEY in datum)),
    ).toBe(true);
  });

  it("preserves native category datasets outside dashboards", () => {
    const model = buildModel(false);

    expect(model.xAxisModel.positions).toBeUndefined();
    expect(
      model.boxDataset.every((datum) => !(X_AXIS_POSITION_KEY in datum)),
    ).toBe(true);
  });
});
