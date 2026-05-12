import {
  IS_WATERFALL_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { ChartDataset } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { createMockVisualizationSettings } from "metabase-types/api/mocks";

import { extendOriginalDatasetWithTotalDatum } from "./dataset";

const settings = (
  overrides: Partial<ComputedVisualizationSettings> = {},
): ComputedVisualizationSettings =>
  createMockVisualizationSettings({
    "waterfall.show_total": true,
    ...overrides,
  });

describe("extendOriginalDatasetWithTotalDatum", () => {
  const seriesKey = "count";
  const dataset: ChartDataset = [
    { [X_AXIS_DATA_KEY]: "a", [seriesKey]: 100 },
    { [X_AXIS_DATA_KEY]: "b", [seriesKey]: 200 },
  ];

  it("appends a total datum with the raw value it was given", () => {
    const result = extendOriginalDatasetWithTotalDatum(
      dataset,
      300,
      seriesKey,
      settings(),
    );

    expect(result).toHaveLength(3);
    expect(result[2][seriesKey]).toBe(300);
    expect(result[2][IS_WATERFALL_TOTAL_DATA_KEY]).toBe(true);
  });

  it("returns the dataset unchanged when waterfall.show_total is off", () => {
    const result = extendOriginalDatasetWithTotalDatum(
      dataset,
      300,
      seriesKey,
      settings({ "waterfall.show_total": false }),
    );

    expect(result).toBe(dataset);
  });

  it("returns the dataset unchanged when it is empty", () => {
    const empty: ChartDataset = [];

    expect(
      extendOriginalDatasetWithTotalDatum(empty, 0, seriesKey, settings()),
    ).toBe(empty);
  });
});
