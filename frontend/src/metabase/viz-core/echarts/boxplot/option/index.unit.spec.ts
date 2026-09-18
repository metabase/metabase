import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getVisualizationTheme } from "../../../shared/utils/theme";
import type {
  CartesianChartSize,
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { getChartLayout } from "../../cartesian/layout";
import { getBoxPlotLayoutModel } from "../layout";
import { getBoxPlotModel } from "../model";

import { getBoxPlotOption } from "./index";

const category = createMockColumn({ name: "category", base_type: "type/Text" });
const metric = createMockColumn({
  name: "value",
  display_name: "Value",
  base_type: "type/Integer",
});
const otherMetric = createMockColumn({
  name: "other",
  display_name: "Other",
  base_type: "type/Integer",
});
const rawSeries: RawSeries = [
  {
    card: createMockCard({ id: 1, display: "boxplot" }),
    data: createMockDatasetData({
      cols: [category, metric, otherMetric],
      rows: [1000, 2000, 2500, 3000, 4000, 15000].map((value) => [
        "A",
        value,
        value * 10,
      ]),
    }),
  },
];

function setup({
  cartesianSize = "small",
  settings: overrides = {},
  staticViz = false,
  height = 450,
}: {
  cartesianSize?: CartesianChartSize;
  settings?: ComputedVisualizationSettings;
  staticViz?: boolean;
  height?: number;
} = {}) {
  const settings = createMockVisualizationSettings({
    "graph.dimensions": ["category"],
    "graph.metrics": ["value"],
    "graph.y_axis.scale": "linear",
    "graph.y_axis.axis_enabled": true,
    "graph.x_axis.axis_enabled": true,
    "graph.y_axis.auto_range": true,
    "graph.label_value_formatting": "compact",
    "graph.show_values": true,
    "graph.label_value_frequency": "all",
    "boxplot.show_values_mode": "all",
    "boxplot.whisker_type": "tukey",
    "boxplot.points_mode": "outliers",
    "boxplot.show_mean": true,
    ...overrides,
  });
  const renderingContext: RenderingContext = {
    fontFamily: "Lato",
    getColor: () => "#333333",
    measureText: (text) => text.length * 8,
    measureTextHeight: () => 13,
    cartesianSize: staticViz ? undefined : cartesianSize,
    theme: getVisualizationTheme({
      theme: DEFAULT_METABASE_COMPONENT_THEME,
      cartesianSize: staticViz ? undefined : cartesianSize,
    }),
  };
  const model = getBoxPlotModel(
    rawSeries,
    settings,
    [],
    undefined,
    renderingContext.cartesianSize,
  );
  const baseLayout = getChartLayout(
    { ...model, dataset: model.boxDataset },
    settings,
    false,
    600,
    height,
    renderingContext,
  );
  const layout = getBoxPlotLayoutModel({
    chartModel: model,
    cartesianLayout: baseLayout,
    settings,
    chartWidth: 600,
    renderingContext,
  });
  const option = getBoxPlotOption(
    model,
    layout,
    settings,
    false,
    renderingContext,
  );
  return { model, layout, settings, option, renderingContext };
}

describe("responsive BoxPlot presentation", () => {
  it.each(["small", "medium", "large"] as const)(
    "uses the %s size policy for axes and data labels",
    (cartesianSize) => {
      const { model } = setup({ cartesianSize });
      const responsive = cartesianSize !== "large";
      expect(model.leftAxisModel?.formatter(1000)).toBe(
        responsive ? "1.0k" : "1,000",
      );
      expect(
        model.seriesLabelsFormatters[model.seriesModels[0].dataKey]?.(1000),
      ).toBe("1.0k");
      expect(model.leftAxisModel?.formatGoal(1000)).toBe("1,000");
    },
  );

  it("keeps native large-axis formatting when data labels are hidden", () => {
    const { model } = setup({
      cartesianSize: "large",
      settings: { "graph.show_values": false },
    });

    expect(model.leftAxisModel?.formatter(1000)).toBe("1,000");
  });

  it("preserves native tick density on large boxplots", () => {
    const { option } = setup({ cartesianSize: "large" });
    expect(option).toMatchObject({
      yAxis: [
        {
          axisTick: expect.not.objectContaining({
            customValues: expect.any(Array),
          }),
        },
      ],
    });
  });

  it.each([
    { formatting: "full", expected: "1,000" },
    { formatting: "compact", expected: "1.0k" },
  ] as const)(
    "preserves explicit $formatting formatting",
    ({ formatting, expected }) => {
      const { model } = setup({
        settings: { "graph.label_value_formatting": formatting },
      });
      expect(model.leftAxisModel?.formatter(1000)).toBe(expected);
      expect(
        model.seriesLabelsFormatters[model.seriesModels[0].dataKey]?.(1000),
      ).toBe(expected);
    },
  );

  it("preserves statistics and the existing static export axes", () => {
    const browser = setup();
    const exported = setup({ staticViz: true });
    expect(browser.model.boxDataset).toEqual(exported.model.boxDataset);
    expect(browser.model.dataBySeriesAndXValue).toEqual(
      exported.model.dataBySeriesAndXValue,
    );
    expect(browser.model.outlierAbovePointsDataset).toEqual(
      exported.model.outlierAbovePointsDataset,
    );
    expect(exported.model.leftAxisModel?.formatter(1000)).toBe("1,000");
    expect(exported.option).toMatchObject({
      yAxis: [
        {
          axisTick: expect.not.objectContaining({
            customValues: expect.any(Array),
          }),
        },
      ],
    });
  });

  it("uses the final adjusted plot height after reserving label overflow", () => {
    const { model, layout, settings, renderingContext } = setup();
    expect(layout.labelOverflow.top).toBeGreaterThan(0);
    const adjustedPadding = {
      ...layout.adjustedPadding,
      top: layout.outerHeight - layout.adjustedPadding.bottom - 199,
    };
    const option = getBoxPlotOption(
      model,
      { ...layout, adjustedPadding },
      settings,
      false,
      renderingContext,
    );
    expect(option).toMatchObject({
      grid: { top: adjustedPadding.top },
      yAxis: [
        {
          axisLabel: { customValues: [0, 15000] },
          axisTick: { customValues: [0, 7500, 15000] },
        },
      ],
    });
  });

  it("includes outliers and a goal beyond the whiskers in the responsive range", () => {
    const { model, option } = setup({
      settings: {
        "graph.show_goal": true,
        "graph.goal_value": 20000,
      },
    });
    expect(model.leftAxisModel?.extent[1]).toBe(15000);
    expect(option).toMatchObject({
      yAxis: [
        {
          axisTick: {
            customValues: expect.arrayContaining([20000]),
          },
        },
      ],
    });
  });

  it("preserves explicit tick counts and bounds", () => {
    const { option } = setup({
      settings: {
        "graph.y_axis.split_number": 7,
        "graph.y_axis.min": 500,
        "graph.y_axis.max": 18000,
        "graph.y_axis.auto_range": false,
      },
    });
    expect(option).toMatchObject({
      yAxis: [
        {
          splitNumber: 7,
          min: 500,
          max: 18000,
          axisTick: expect.not.objectContaining({
            customValues: expect.any(Array),
          }),
        },
      ],
    });
  });

  it("keeps both responsive axes on their own statistical ranges", () => {
    const { option, model } = setup({
      settings: {
        "graph.metrics": ["value", "other"],
        series: (key) => ({
          axis: key.card._seriesKey === "value" ? "left" : "right",
        }),
        "graph.y_axis.auto_split": false,
      },
    });
    expect(model.leftAxisModel?.extent[1]).toBe(15000);
    expect(model.rightAxisModel?.extent[1]).toBe(150000);
    expect(option.yAxis).toHaveLength(2);
    expect(option).toMatchObject({
      yAxis: [
        { axisTick: { customValues: expect.arrayContaining([15000]) } },
        {
          axisTick: { customValues: expect.arrayContaining([150000]) },
          splitLine: { lineStyle: { opacity: 0 } },
        },
      ],
    });
  });
});
