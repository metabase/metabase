import { createMockSeriesModel } from "__support__/echarts";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockInsight,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getTrendLines } from "./trend-line";
import type {
  ChartDataset,
  NumericAxisScaleTransforms,
  StackModel,
} from "./types";

// Regression witness for metabase#25614 — trend lines on a Stack-100%
// (normalized) chart. The trend series must be normalized to the same [0, 1]
// domain as the stacked bars; otherwise they are computed with raw values and
// render far outside the visible normalized axis (i.e. "no trend line").

const renderingContext: RenderingContext = {
  getColor: (color) => color,
  measureText: () => 10,
  measureTextHeight: () => 10,
  fontFamily: "Arial",
  theme: { cartesian: { label: { fontSize: 12 } } } as any,
};

const yAxisScaleTransforms: NumericAxisScaleTransforms = {
  toEChartsAxisValue: (value) => (typeof value === "number" ? value : null),
  fromEChartsAxisValue: (value) => value,
};

const setup = (stackType: "normalized" | "stacked" | null) => {
  const countSeries = createMockSeriesModel({
    dataKey: "count",
    cardId: 1,
    color: "red",
    column: createMockColumn({ name: "count" }),
  });
  const avgSeries = createMockSeriesModel({
    dataKey: "avg",
    cardId: 1,
    color: "blue",
    column: createMockColumn({ name: "avg" }),
  });

  const rawSeries: RawSeries = [
    {
      card: createMockCard({ id: 1 }),
      data: createMockDatasetData({
        // slope 0 keeps the trend value constant across x, so the assertion
        // isolates the normalization, not the fit: count->30, avg->10 at every x.
        insights: [
          createMockInsight({ col: "count", slope: 0, offset: 30 }),
          createMockInsight({ col: "avg", slope: 0, offset: 10 }),
        ],
      }),
    },
  ];

  const chartDataset: ChartDataset = [
    { [X_AXIS_DATA_KEY]: "2023-01-01T00:00:00Z", count: 30, avg: 10 },
    { [X_AXIS_DATA_KEY]: "2024-01-01T00:00:00Z", count: 30, avg: 10 },
  ];

  const stackModels: StackModel[] = [
    { axis: "left", display: "bar", seriesKeys: ["count", "avg"] },
  ];

  const settings: ComputedVisualizationSettings =
    createMockVisualizationSettings({
      "graph.show_trendline": true,
      "graph.y_axis.auto_range": true,
      "stackable.stack_type": stackType,
    });

  return getTrendLines(
    rawSeries,
    [null, null],
    yAxisScaleTransforms,
    [countSeries, avgSeries],
    chartDataset,
    settings,
    stackModels,
    renderingContext,
  );
};

describe("getTrendLines (metabase#25614)", () => {
  it("builds a trend series for each numeric series", () => {
    const model = setup("normalized");
    expect(model?.seriesModels.map((s) => s.dataKey)).toEqual([
      "count_trend",
      "avg_trend",
    ]);
  });

  it("normalizes trend values to [0, 1] for a Stack-100% chart", () => {
    const model = setup("normalized");

    // count 30 of 40 -> 0.75, avg 10 of 40 -> 0.25, at every x
    for (const datum of model!.dataset) {
      expect(datum.count_trend).toBeCloseTo(0.75);
      expect(datum.avg_trend).toBeCloseTo(0.25);
      expect(
        (datum.count_trend as number) + (datum.avg_trend as number),
      ).toBeCloseTo(1);
    }
  });

  it("leaves trend values un-normalized when the chart is not Stack-100%", () => {
    const model = setup("stacked");

    for (const datum of model!.dataset) {
      expect(datum.count_trend).toBeCloseTo(30);
      expect(datum.avg_trend).toBeCloseTo(10);
    }
  });
});
