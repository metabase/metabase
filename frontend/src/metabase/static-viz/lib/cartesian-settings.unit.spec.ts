import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getStaticCartesianChartSettings } from "./cartesian-settings";

const dateCol = createMockColumn({
  name: "CREATED_AT",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
});

const numericCol = createMockColumn({
  name: "COUNT",
  base_type: "type/Integer",
  effective_type: "type/Integer",
});

const categoryCol = createMockColumn({
  name: "CATEGORY",
  base_type: "type/Text",
  effective_type: "type/Text",
});

const buildRawSeries = (cols = [dateCol, numericCol]) => [
  createMockSingleSeries({ name: "Q" }, { data: { cols } }),
];

const buildSettings = (
  overrides: Partial<ComputedVisualizationSettings> = {},
): ComputedVisualizationSettings =>
  createMockVisualizationSettings({
    "graph.x_axis.scale": "ordinal",
    "graph.dimensions": ["CREATED_AT"],
    ...overrides,
  });

describe("getStaticCartesianChartSettings", () => {
  it("converts an ordinal scale to timeseries when the x column is a date", () => {
    const settings = buildSettings();
    const result = getStaticCartesianChartSettings(buildRawSeries(), settings);

    expect(result["graph.x_axis.scale"]).toBe("timeseries");
  });

  it("returns the original settings reference when nothing needs to change (ordinal on non-date)", () => {
    const settings = buildSettings({ "graph.dimensions": ["CATEGORY"] });
    const result = getStaticCartesianChartSettings(
      buildRawSeries([categoryCol, numericCol]),
      settings,
    );

    expect(result).toBe(settings);
    expect(result["graph.x_axis.scale"]).toBe("ordinal");
  });

  it("leaves the scale alone when it is already timeseries", () => {
    const settings = buildSettings({ "graph.x_axis.scale": "timeseries" });
    const result = getStaticCartesianChartSettings(buildRawSeries(), settings);

    expect(result).toBe(settings);
    expect(result["graph.x_axis.scale"]).toBe("timeseries");
  });

  it("leaves a numeric scale alone", () => {
    const settings = buildSettings({ "graph.x_axis.scale": "linear" });
    const result = getStaticCartesianChartSettings(buildRawSeries(), settings);

    expect(result).toBe(settings);
    expect(result["graph.x_axis.scale"]).toBe("linear");
  });

  it("does nothing when no x dimension is configured", () => {
    const settings = buildSettings({ "graph.dimensions": [] });
    const result = getStaticCartesianChartSettings(buildRawSeries(), settings);

    expect(result).toBe(settings);
    expect(result["graph.x_axis.scale"]).toBe("ordinal");
  });

  it("does nothing when the configured x dimension is not in the dataset", () => {
    const settings = buildSettings({ "graph.dimensions": ["MISSING"] });
    const result = getStaticCartesianChartSettings(buildRawSeries(), settings);

    expect(result).toBe(settings);
    expect(result["graph.x_axis.scale"]).toBe("ordinal");
  });
});
