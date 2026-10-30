import { registerVisualizations } from "metabase/visualizations/register";
import {
  canBrush,
  getTooltipModel,
} from "metabase/visualizations/visualizations/CartesianChart/events";
import {
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
  getCartesianChartModel,
  getComputedSettingsForSeries,
  getSizeAdjustedSettings,
  getVisualizationTransformed,
} from "metabase/viz-core";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
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

const sumColumn = createMockColumn({
  name: "sum",
  display_name: "Sum",
  id: 42,
  field_ref: ["field", 42, null],
  base_type: "type/Integer",
  source: "aggregation",
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
          display_name: "Count",
          base_type: "type/Integer",
          source: "aggregation",
        }),
        sumColumn,
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

  it.each(["rotate-45", "rotate-90", "compact"] as const)(
    "shows category labels unrotated despite a saved %s label setting",
    (axisEnabled) => {
      const { computedSettings } = setup("row", {
        "graph.x_axis.axis_enabled": axisEnabled,
      });

      expect(computedSettings["graph.x_axis.axis_enabled"]).toBe(true);
    },
  );

  it("keeps hidden category labels hidden", () => {
    const { computedSettings } = setup("row", {
      "graph.x_axis.axis_enabled": false,
    });

    expect(computedSettings["graph.x_axis.axis_enabled"]).toBe(false);
  });

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

  it("keeps one metric axis where a bar chart would auto-split a second", () => {
    const getRightAxisModel = (display: VisualizationDisplay) => {
      const rawSeries = createSeries(display, {
        "graph.y_axis.auto_split": true,
      });
      // "sum" runs a million times larger than "count".
      rawSeries[0].data.rows = [
        ["2024-01-01T00:00:00Z", 1, 1_000_000],
        ["2024-02-01T00:00:00Z", 2, 2_000_000],
      ];
      const computedSettings = getComputedSettingsForSeries(
        getVisualizationTransformed(rawSeries).series,
      );
      return getCartesianChartModel(
        rawSeries,
        computedSettings,
        [],
        renderingContext,
      ).rightAxisModel;
    };

    expect(getRightAxisModel("bar")).not.toBeNull();
    expect(getRightAxisModel("row")).toBeNull();
  });

  it("leaves those settings working on other chart types", () => {
    const { seriesDisplays, chartModel } = setup("bar", {
      series_settings: { count: { display: "line" }, sum: { axis: "right" } },
    });

    expect(seriesDisplays).toEqual(["line", "bar"]);
    expect(chartModel.rightAxisModel?.seriesKeys).toHaveLength(1);
  });
});

describe("row chart axis 'Show label' setting", () => {
  const getAxisTitles = (width: number, height: number) => {
    // One metric, so the metric axis has a default title.
    const rawSeries = createSeries("row", { "graph.metrics": ["count"] });
    const settings = getSizeAdjustedSettings({
      settings: getComputedSettingsForSeries(
        getVisualizationTransformed(rawSeries).series,
      ),
      width,
      height,
    });
    const chartModel = getCartesianChartModel(
      rawSeries,
      settings,
      [],
      renderingContext,
    );
    return [chartModel.xAxisModel.label, chartModel.leftAxisModel?.label];
  };

  it("defaults to Auto on both axes, as on bar charts", () => {
    const { computedSettings } = setup("row", {});

    expect(computedSettings["graph.x_axis.labels_enabled"]).toBe("auto");
    expect(computedSettings["graph.y_axis.labels_enabled"]).toBe("auto");
  });

  it("keeps axis titles on a large chart and hides them on a small one", () => {
    expect(getAxisTitles(640, 420)).toEqual(["Created At", "Count"]);
    expect(getAxisTitles(300, 200)).toEqual([undefined, undefined]);
  });
});

describe("row chart additional tooltip columns", () => {
  const getTooltipRowNames = (settings: VisualizationSettings) => {
    // "sum" is left off the chart, so it's available as a tooltip column.
    const { computedSettings, chartModel } = setup("row", {
      "graph.metrics": ["count"],
      ...settings,
    });
    const tooltipModel = getTooltipModel(
      chartModel,
      computedSettings,
      0,
      "row",
      chartModel.seriesModels[0].dataKey,
    );

    return tooltipModel?.rows.map((row) => row.name);
  };

  it("shows none by default, as on bar charts", () => {
    expect(getTooltipRowNames({})).toEqual(["Count"]);
  });

  it("shows the columns picked in the setting", () => {
    expect(
      getTooltipRowNames({
        "graph.tooltip_columns": [getColumnKey(sumColumn)],
      }),
    ).toEqual(["Count", "Sum"]);
  });
});
