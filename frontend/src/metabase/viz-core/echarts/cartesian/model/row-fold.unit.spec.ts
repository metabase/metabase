import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";

import { MIN_BAR_HEIGHT, foldRowChartModel } from "./row-fold";

import { getCartesianChartModel } from "./index";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const settings = createMockVisualizationSettings({
  "graph.dimensions": ["CATEGORY"],
  "graph.metrics": ["count"],
  "graph.x_axis.scale": "ordinal",
  series: () => ({ display: "bar" }),
});

const getModel = (values: number[]) => {
  const rawSeries: RawSeries = [
    {
      card: createMockCard({ display: "row" }),
      data: createMockDatasetData({
        rows: values.map((value, index) => [`C${index + 1}`, value]),
        cols: [
          createMockColumn({ name: "CATEGORY", base_type: "type/Text" }),
          createMockColumn({ name: "count", base_type: "type/Integer" }),
        ],
      }),
    },
  ];
  return getCartesianChartModel(rawSeries, settings, [], renderingContext);
};

describe("foldRowChartModel", () => {
  const ROW_BUDGET = 4;
  const plotHeight = ROW_BUDGET * MIN_BAR_HEIGHT;

  it("refits the metric axis to the folded Other row's total", () => {
    const model = getModel([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(model.leftAxisModel?.extent).toEqual([100, 100]);

    const folded = foldRowChartModel(model, plotHeight, settings);

    // Three rows kept; the other five sum into "Other".
    expect(folded.transformedDataset).toHaveLength(ROW_BUDGET);
    expect(folded.leftAxisModel?.extent).toEqual([100, 500]);
  });

  it("refits the metric axis when folded rows sum below zero", () => {
    const model = getModel([300, 200, 100, -10, -20, -30, -40, -50]);

    const folded = foldRowChartModel(model, plotHeight, settings);

    // "Other" sums the five negatives to -150, below every original row.
    expect(folded.leftAxisModel?.extent).toEqual([-150, 300]);
  });

  it("leaves a model that fits untouched", () => {
    const model = getModel([100, 200, 300]);

    expect(foldRowChartModel(model, plotHeight, settings)).toBe(model);
  });
});
