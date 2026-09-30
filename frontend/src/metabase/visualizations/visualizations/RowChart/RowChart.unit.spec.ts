import { registerVisualizations } from "metabase/visualizations/register";
import { canBrush } from "metabase/visualizations/visualizations/CartesianChart/events";
import {
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
  getCartesianChartModel,
  getComputedSettingsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";
import type {
  RawSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

registerVisualizations();

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 10,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const createdAtColumn = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  unit: "month",
  source: "breakout",
});

const createSeries = (
  display: VisualizationDisplay,
  settings: VisualizationSettings,
): RawSeries => [
  {
    card: createMockCard({
      display,
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "sum"],
        ...settings,
      },
    }),
    data: createMockDatasetData({
      cols: [
        createdAtColumn,
        createMockColumn({
          name: "count",
          base_type: "type/Integer",
          source: "aggregation",
        }),
        createMockColumn({
          name: "sum",
          id: 42,
          field_ref: ["field", 42, null],
          base_type: "type/Integer",
          source: "aggregation",
        }),
      ],
      rows: [
        ["2024-01-01T00:00:00Z", 10, 100],
        ["2024-02-01T00:00:00Z", 20, 150],
      ],
    }),
  },
];

const setup = (
  display: VisualizationDisplay,
  settings: VisualizationSettings,
) => {
  const rawSeries = createSeries(display, settings);
  const computedSettings = getComputedSettingsForSeries(
    getVisualizationTransformed(rawSeries).series,
  );
  const chartModel = getCartesianChartModel(
    rawSeries,
    computedSettings,
    [],
    renderingContext,
  );
  const seriesDisplays = chartModel.seriesModels.map(
    (seriesModel) =>
      computedSettings.series?.(seriesModel.legacySeriesSettingsObjectKey)
        ?.display,
  );

  return { rawSeries, computedSettings, chartModel, seriesDisplays };
};

// A card switched to a row chart keeps settings saved as a bar or combo chart.
describe("row chart settings carried over from another chart type", () => {
  it.each(["timeseries", "linear"] as const)(
    "ignores a saved %s dimension scale, so the axis stays categorical and brush zoom stays off",
    (scale) => {
      const { rawSeries, computedSettings, chartModel } = setup("row", {
        "graph.x_axis.scale": scale,
      });

      expect(computedSettings["graph.x_axis.scale"]).toBe("ordinal");
      expect(chartModel.xAxisModel.axisType).toBe("category");
      expect(
        canBrush(rawSeries, computedSettings, createdAtColumn, () => {}),
      ).toBe(false);
    },
  );

  it("draws every series as a bar despite a saved line or area display", () => {
    const { seriesDisplays } = setup("row", {
      series_settings: { count: { display: "line" }, sum: { display: "area" } },
    });

    expect(seriesDisplays).toEqual(["bar", "bar"]);
  });

  it("keeps one metric axis despite a saved right-axis position", () => {
    const { chartModel } = setup("row", {
      series_settings: { sum: { axis: "right" } },
    });

    expect(chartModel.rightAxisModel).toBeNull();
    expect(chartModel.leftAxisModel?.seriesKeys).toHaveLength(2);
  });

  it("leaves those settings working on other chart types", () => {
    const { seriesDisplays, chartModel } = setup("bar", {
      series_settings: { count: { display: "line" }, sum: { axis: "right" } },
    });

    expect(seriesDisplays).toEqual(["line", "bar"]);
    expect(chartModel.rightAxisModel?.seriesKeys).toHaveLength(1);
  });
});
