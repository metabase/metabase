import {
  createMockCartesianChartModel,
  createMockSeriesModel,
} from "__support__/echarts";
import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import {
  DEFAULT_VISUALIZATION_THEME,
  getVisualizationTheme,
} from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import type { XAxisModel, YAxisModel } from "../model/types";
import { buildAxes } from "../option/axis";

import { type ChartLayoutInput, getChartLayout } from ".";

const WIDEST_MEASURED_TICK_WIDTH = 64;

const formatCurrency = (value: unknown) => {
  const numberValue = Number(value);

  if (Math.abs(numberValue) >= 1000) {
    return `$${(numberValue / 1000).toFixed(2)}k`;
  }

  return `$${numberValue.toFixed(2)}`;
};

const xAxisModel: XAxisModel = {
  axisType: "category",
  isHistogram: false,
  valuesCount: 3,
  formatter: (value) => String(value),
};

const yAxisModel: YAxisModel = {
  seriesKeys: ["price"],
  extent: [1200, 1800],
  column: createMockColumn({ name: "price" }),
  formatter: formatCurrency,
  formatGoal: formatCurrency,
  splitNumber: 5,
};

const input: ChartLayoutInput = {
  xAxisModel,
  leftAxisModel: yAxisModel,
  rightAxisModel: null,
  yAxisScaleTransforms: {
    toEChartsAxisValue: (value) => {
      return typeof value === "number" ? value : null;
    },
    fromEChartsAxisValue: (value) => value,
  },
};

const settings = createMockVisualizationSettings({
  "graph.label_value_formatting": "compact",
  "graph.x_axis.axis_enabled": false,
  "graph.y_axis.axis_enabled": true,
  "graph.y_axis.auto_range": true,
});

const currencySettings = createMockVisualizationSettings({
  ...settings,
  column: () => ({ number_style: "currency" }),
});

const getChartContext = (): RenderingContext => {
  const measureText = jest.fn((text: string) => {
    if (text === "$720.00") {
      return WIDEST_MEASURED_TICK_WIDTH;
    }

    return 20;
  });

  return {
    getColor: (name) => name,
    measureText,
    measureTextHeight: () => 0,
    fontFamily: "",
    theme: DEFAULT_VISUALIZATION_THEME,
  };
};

describe("getChartLayout", () => {
  it.each([
    {
      name: "fullscreen",
      options: {},
      fontSize: 14,
      marginX: 14,
      marginY: 24,
      axisTitleFontSize: 14,
    },
    {
      name: "small",
      options: { cartesianSize: "small" as const },
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitleFontSize: 11,
    },
    {
      name: "medium",
      options: { cartesianSize: "medium" as const },
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitleFontSize: 12,
    },
    {
      name: "large",
      options: { cartesianSize: "large" as const },
      fontSize: 12,
      marginX: 10,
      marginY: 16,
      axisTitleFontSize: 12,
    },
  ])(
    "measures and renders $name ticks with matching styles",
    ({ options, fontSize, marginX, marginY, axisTitleFontSize }) => {
      const chartContext = {
        ...getChartContext(),
        theme: getVisualizationTheme({
          theme: DEFAULT_METABASE_COMPONENT_THEME,
          ...options,
        }),
      };
      const chartModel = createMockCartesianChartModel({
        ...input,
        rightAxisModel: yAxisModel,
        transformedDataset: [
          { [X_AXIS_DATA_KEY]: "Alpha", price: 1200 },
          { [X_AXIS_DATA_KEY]: "Beta", price: 1500 },
          { [X_AXIS_DATA_KEY]: "Gamma", price: 1800 },
        ],
      });
      const chartSettings = createMockVisualizationSettings({
        ...currencySettings,
        "graph.x_axis.axis_enabled": true,
      });
      const chartLayout = getChartLayout(
        chartModel,
        chartSettings,
        false,
        640,
        360,
        chartContext,
      );
      const axes = buildAxes(
        chartModel,
        chartLayout,
        chartSettings,
        false,
        chartContext,
      );

      expect(chartContext.measureText).toHaveBeenCalledWith(
        "Alpha",
        expect.objectContaining({ size: fontSize }),
      );
      expect(chartContext.measureText).toHaveBeenCalledWith(
        "$720.00",
        expect.objectContaining({ size: fontSize }),
      );
      expect(chartLayout.ticksDimensions.xTicksHeight).toBe(fontSize + marginX);
      expect(chartLayout.ticksDimensions.yTicksWidthLeft).toBe(
        WIDEST_MEASURED_TICK_WIDTH + marginY,
      );
      expect(chartLayout.ticksDimensions.yTicksWidthRight).toBe(
        WIDEST_MEASURED_TICK_WIDTH + marginY,
      );
      expect(axes.xAxis.axisLabel).toMatchObject({ fontSize, margin: marginX });
      expect(axes.yAxis).toHaveLength(2);
      for (const axis of axes.yAxis) {
        expect(axis.axisLabel).toMatchObject({ fontSize, margin: marginY });
        expect(axis.nameTextStyle?.fontSize).toBe(axisTitleFontSize);
        expect(axis.nameTextStyle?.fontWeight).toBe(700);
      }
    },
  );

  describe.each([
    { name: "fullscreen", options: {} },
    { name: "small", options: { cartesianSize: "small" as const } },
    { name: "medium", options: { cartesianSize: "medium" as const } },
    { name: "large", options: { cartesianSize: "large" as const } },
  ])("hidden $name axes", ({ options }) => {
    it.each([false, true])(
      "preserves existing space with split panels %s",
      (isSplitPanels) => {
        const chartContext = {
          ...getChartContext(),
          theme: getVisualizationTheme({
            theme: DEFAULT_METABASE_COMPONENT_THEME,
            ...options,
          }),
        };
        const chartLayout = getChartLayout(
          {
            ...input,
            rightAxisModel: yAxisModel,
            seriesModels: [createMockSeriesModel(), createMockSeriesModel()],
            splitPanelYAxisModels: [yAxisModel, yAxisModel],
          },
          createMockVisualizationSettings({
            ...settings,
            "graph.y_axis.axis_enabled": false,
            "graph.split_panels": isSplitPanels,
          }),
          false,
          640,
          360,
          chartContext,
        );

        expect(chartLayout.ticksDimensions.yTicksWidthLeft).toBe(12);
        expect(chartLayout.ticksDimensions.yTicksWidthRight).toBe(
          isSplitPanels ? 0 : 12,
        );
      },
    );
  });

  it("does not reserve padding for empty x- or y-axis titles", () => {
    const chartContext = getChartContext();
    const {
      fontSize: axisTitleFontSize,
      marginX,
      marginY,
    } = chartContext.theme.cartesian.axisTitle;
    const chartSettings = createMockVisualizationSettings({
      ...settings,
      "graph.x_axis.labels_enabled": true,
      "graph.y_axis.labels_enabled": true,
    });

    const getLayout = (xLabel: string, yLabel: string) =>
      getChartLayout(
        {
          ...input,
          xAxisModel: { ...xAxisModel, label: xLabel },
          leftAxisModel: { ...yAxisModel, label: yLabel },
        },
        chartSettings,
        false,
        640,
        360,
        chartContext,
      );

    const empty = getLayout("", "");
    const titled = getLayout("Created At", "Count");

    expect(empty.padding.bottom).toBe(CHART_STYLE.padding.y);
    expect(titled.padding.bottom).toBe(
      empty.padding.bottom + axisTitleFontSize / 2 + marginX,
    );
    expect(titled.padding.left).toBe(
      empty.padding.left + axisTitleFontSize + marginY,
    );
  });

  it("measures actual y-axis tick labels for a zero-pinned axis (#74568)", () => {
    const chartContext = getChartContext();

    const chartLayout = getChartLayout(
      input,
      currencySettings,
      false,
      480,
      274,
      chartContext,
    );

    expect(chartContext.measureText).toHaveBeenCalledWith(
      "$720.00",
      expect.anything(),
    );
    expect(chartLayout.ticksDimensions.yTicksWidthLeft).toBe(
      WIDEST_MEASURED_TICK_WIDTH + 24,
    );
    expect(chartLayout.ticksDimensions.yTicksWidthLeft).not.toBe(
      WIDEST_MEASURED_TICK_WIDTH + 24 + CHART_STYLE.padding.x,
    );
  });

  it("reserves row value label room for the drawn label on a log scale", () => {
    const chartContext: RenderingContext = {
      ...getChartContext(),
      measureText: (text) => text.length * 10,
    };
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      // log10(1,000,000) and the sign-preserving log10(1,000).
      transformedDataset: [
        { [X_AXIS_DATA_KEY]: "A", count: 6 },
        { [X_AXIS_DATA_KEY]: "B", count: -3 },
      ],
      yAxisScaleTransforms: {
        toEChartsAxisValue: (value) =>
          typeof value === "number"
            ? Math.sign(value) * Math.log10(Math.abs(value))
            : null,
        fromEChartsAxisValue: (value) =>
          Math.sign(value) * 10 ** Math.abs(value),
      },
      seriesLabelsFormatters: { count: (value) => String(value) },
    };

    const chartLayout = getChartLayout(
      rowInput,
      createMockVisualizationSettings({ "graph.show_values": true }),
      false,
      480,
      274,
      chartContext,
    );

    // "1000000" and "-1000", not "6" and "-3".
    expect(chartLayout.padding.right).toBe(
      CHART_STYLE.padding.x + 70 + CHART_STYLE.seriesLabels.offset,
    );
    expect(chartLayout.negativeDataLabelsWidth).toBe(
      50 + CHART_STYLE.seriesLabels.offset,
    );
  });

  it("reserves no row value label room for a series hidden from the legend", () => {
    const chartContext: RenderingContext = {
      ...getChartContext(),
      measureText: (text) => text.length * 10,
    };
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      transformedDataset: [
        { [X_AXIS_DATA_KEY]: "A", count: 12, sum: 1234567 },
        { [X_AXIS_DATA_KEY]: "B", count: 34, sum: -7654321 },
      ],
      seriesModels: [
        createMockSeriesModel({ dataKey: "count" }),
        createMockSeriesModel({ dataKey: "sum", visible: false }),
      ],
      seriesLabelsFormatters: {
        count: (value) => String(value),
        sum: (value) => String(value),
      },
    };

    const chartLayout = getChartLayout(
      rowInput,
      createMockVisualizationSettings({ "graph.show_values": true }),
      false,
      480,
      274,
      chartContext,
    );

    // Only "34", the widest visible label; nothing for the hidden "sum".
    expect(chartLayout.padding.right).toBe(
      CHART_STYLE.padding.x + 20 + CHART_STYLE.seriesLabels.offset,
    );
    expect(chartLayout.negativeDataLabelsWidth).toBe(0);
  });

  it("reserves the metric tick labels' margin below a row chart's plot", () => {
    const chartContext = getChartContext();
    const { ticks } = chartContext.theme.cartesian;
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      transformedDataset: [{ [X_AXIS_DATA_KEY]: "A", price: 1500 }],
    };

    const chartLayout = getChartLayout(
      rowInput,
      createMockVisualizationSettings(),
      false,
      480,
      274,
      chartContext,
    );

    expect(chartLayout.ticksDimensions.xTicksHeight).toBe(
      ticks.fontSize + ticks.marginX,
    );
  });

  it("reserves the same category title room on a row chart as an upright chart's left axis", () => {
    const chartContext = getChartContext();
    const { fontSize, marginY } = chartContext.theme.cartesian.axisTitle;
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      transformedDataset: [{ [X_AXIS_DATA_KEY]: "A", price: 1500 }],
    };
    const getLeftPadding = (titleText: string) =>
      getChartLayout(
        rowInput,
        createMockVisualizationSettings({
          "graph.x_axis.labels_enabled": true,
          "graph.x_axis.title_text": titleText,
        }),
        false,
        480,
        274,
        chartContext,
      ).padding.left;

    expect(getLeftPadding("Category")).toBe(
      getLeftPadding("") + fontSize + marginY,
    );
  });

  it("measures row category labels as drawn, padded with spaces", () => {
    const chartContext: RenderingContext = {
      ...getChartContext(),
      measureText: (text) => text.length * 10,
    };
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      transformedDataset: [{ [X_AXIS_DATA_KEY]: "ABC", price: 1500 }],
    };

    const chartLayout = getChartLayout(
      rowInput,
      createMockVisualizationSettings(),
      false,
      480,
      274,
      chartContext,
    );

    // " ABC " is 5 characters wide.
    expect(chartLayout.ticksDimensions.yTicksWidthLeft).toBe(
      50 + chartContext.theme.cartesian.ticks.marginY,
    );
  });

  it("reserves row goal label room only in static renders, which show the label", () => {
    const rowInput: ChartLayoutInput = {
      ...input,
      isRowChart: true,
      transformedDataset: [{ [X_AXIS_DATA_KEY]: "A", price: 1500 }],
    };
    const getTopPadding = ({
      hasGoal,
      isStatic,
    }: {
      hasGoal: boolean;
      isStatic: boolean;
    }) =>
      getChartLayout(
        rowInput,
        createMockVisualizationSettings({
          "graph.show_goal": hasGoal,
          "graph.goal_value": 1500,
          "graph.goal_label": "Target",
        }),
        false,
        480,
        274,
        { ...getChartContext(), isStatic },
      ).padding.top;

    expect(getTopPadding({ hasGoal: true, isStatic: false })).toBe(
      getTopPadding({ hasGoal: false, isStatic: false }),
    );
    expect(getTopPadding({ hasGoal: true, isStatic: true })).toBeGreaterThan(
      getTopPadding({ hasGoal: false, isStatic: true }),
    );
  });
});
