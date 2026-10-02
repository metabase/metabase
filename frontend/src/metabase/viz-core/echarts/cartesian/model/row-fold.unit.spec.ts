import type { RawSeries, VisualizationSettings } from "metabase-types/api";
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

const createSettings = (extra: VisualizationSettings = {}) =>
  createMockVisualizationSettings({
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": "ordinal",
    series: () => ({ display: "bar" }),
    ...extra,
  });

const settings = createSettings();

// Each row is [count] or, for two metrics, [count, sum].
const getModel = (rows: number[][], modelSettings = settings) => {
  const metricNames = ["count", "sum"].slice(0, rows[0].length);
  const rawSeries: RawSeries = [
    {
      card: createMockCard({ display: "row" }),
      data: createMockDatasetData({
        rows: rows.map((values, index) => [`C${index + 1}`, ...values]),
        cols: [
          createMockColumn({ name: "CATEGORY", base_type: "type/Text" }),
          ...metricNames.map((name) =>
            createMockColumn({ name, base_type: "type/Integer" }),
          ),
        ],
      }),
    },
  ];
  return getCartesianChartModel(rawSeries, modelSettings, [], renderingContext);
};

const single = (values: number[]) => values.map((value) => [value]);

describe("foldRowChartModel", () => {
  const ROW_BUDGET = 4;
  const plotHeight = ROW_BUDGET * MIN_BAR_HEIGHT;

  it("refits the metric axis to the folded Other row's total", () => {
    const model = getModel(single([100, 100, 100, 100, 100, 100, 100, 100]));
    expect(model.leftAxisModel?.extent).toEqual([100, 100]);

    const folded = foldRowChartModel(model, plotHeight, settings);

    // Three rows kept; the other five sum into "Other".
    expect(folded.transformedDataset).toHaveLength(ROW_BUDGET);
    expect(folded.leftAxisModel?.extent).toEqual([100, 500]);
  });

  it("refits the metric axis when folded rows sum below zero", () => {
    const model = getModel(single([300, 200, 100, -10, -20, -30, -40, -50]));

    const folded = foldRowChartModel(model, plotHeight, settings);

    // "Other" sums the five negatives to -150, below every original row.
    expect(folded.leftAxisModel?.extent).toEqual([-150, 300]);
  });

  it("leaves a model that fits untouched", () => {
    const model = getModel(single([100, 200, 300]));

    expect(foldRowChartModel(model, plotHeight, settings)).toBe(model);
  });

  // "Other" is the 4th row: three kept rows, then five folded 100s (raw 500).
  const OTHER_INDEX = 3;
  const SCALED_VALUES = single([1000, 900, 800, 100, 100, 100, 100, 100]);

  it.each(["log", "pow"] as const)(
    "scales the Other row's raw total on a %s axis",
    (scale) => {
      const scaledSettings = createSettings({ "graph.y_axis.scale": scale });
      const model = getModel(SCALED_VALUES, scaledSettings);
      const [{ dataKey }] = model.seriesModels;

      const folded = foldRowChartModel(model, plotHeight, scaledSettings);

      expect(folded.dataset[OTHER_INDEX][dataKey]).toBe(500);
      expect(folded.transformedDataset[OTHER_INDEX][dataKey]).toBeCloseTo(
        Number(model.yAxisScaleTransforms.toEChartsAxisValue(500)),
      );
    },
  );

  it("normalizes the Other row of a 100% stacked chart", () => {
    const stackedSettings = createSettings({
      "graph.metrics": ["count", "sum"],
      "stackable.stack_type": "normalized",
    });
    const model = getModel(
      [30, 40, 50, 60, 70, 80, 90, 100].map((count) => [count, 100 - count]),
      stackedSettings,
    );
    const dataKeys = model.seriesModels.map((series) => series.dataKey);

    const folded = foldRowChartModel(model, plotHeight, stackedSettings);
    const other = folded.transformedDataset[OTHER_INDEX];

    expect(
      dataKeys.reduce((total, dataKey) => total + Number(other[dataKey]), 0),
    ).toBeCloseTo(1);
  });
});
