import { IS_WATERFALL_TOTAL_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getWaterfallChartModel } from "./index";

describe("getWaterfallChartModel", () => {
  const dimensionColumn = createMockColumn({
    name: "bucket",
    display_name: "Bucket",
    base_type: "type/Text",
    semantic_type: "type/Category",
  });
  const metricColumn = createMockColumn({
    name: "count",
    display_name: "Count",
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
  });

  // Includes a negative value so the running total is not monotonic; this
  // prevents accidentally testing the "last end happens to equal the sum" case.
  const rows: [string, number][] = [
    ["a", 100],
    ["b", 200],
    ["c", -50],
    ["d", 300],
  ];
  const expectedRawTotal = 550;

  const rawSeries: RawSeries = [
    {
      card: createMockCard({ id: 1, name: "Waterfall", display: "waterfall" }),
      data: createMockDatasetData({
        rows,
        cols: [dimensionColumn, metricColumn],
      }),
    },
  ];

  const renderingContext: RenderingContext = {
    getColor: () => "#000000",
    measureText: () => 10,
    measureTextHeight: () => 10,
    fontFamily: "Arial",
    theme: { cartesian: { label: { fontSize: 12 } } } as any,
  };

  const buildModel = (
    yAxisScale: "linear" | "log" | "pow",
    extraSettings: Partial<ComputedVisualizationSettings> = {},
  ) =>
    getWaterfallChartModel(
      rawSeries,
      createMockVisualizationSettings({
        "graph.dimensions": [dimensionColumn.name],
        "graph.metrics": [metricColumn.name],
        "graph.x_axis.scale": "ordinal",
        "graph.y_axis.scale": yAxisScale,
        "waterfall.show_total": true,
        ...extraSettings,
      }),
      [],
      renderingContext,
    );

  it.each(["linear", "log", "pow"] as const)(
    "puts the raw total (not the y-axis-transformed value) into the dataset's Total row on %s scale",
    (scale) => {
      const { dataset, seriesModels } = buildModel(scale);
      const seriesDataKey = seriesModels[0].dataKey;

      const totalDatum = dataset[dataset.length - 1];
      expect(totalDatum[IS_WATERFALL_TOTAL_DATA_KEY]).toBe(true);
      expect(totalDatum[seriesDataKey]).toBe(expectedRawTotal);
    },
  );

  it("omits the Total row when waterfall.show_total is disabled", () => {
    const { dataset } = buildModel("log", { "waterfall.show_total": false });

    expect(dataset).toHaveLength(rows.length);
    expect(
      dataset.some((datum) => datum[IS_WATERFALL_TOTAL_DATA_KEY] === true),
    ).toBe(false);
  });
});
