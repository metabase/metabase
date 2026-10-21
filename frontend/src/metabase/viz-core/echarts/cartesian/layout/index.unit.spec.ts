import {
  createMockCartesianChartModel,
  createMockSeriesModel,
} from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
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

  it("exposes the internal inset that no axis content occupies", () => {
    const chartContext = getChartContext();
    const { fontSize, marginY } = chartContext.theme.cartesian.axisTitle;
    const basePadding = {
      left: CHART_STYLE.padding.x,
      right: CHART_STYLE.padding.x,
    };
    const titledAxesInput = {
      ...input,
      leftAxisModel: { ...yAxisModel, label: "Price" },
      rightAxisModel: { ...yAxisModel, label: "Price" },
    };

    const layout = getChartLayout(
      input,
      settings,
      false,
      640,
      360,
      chartContext,
    );
    expect(layout.internalInset).toEqual(basePadding);

    const titledAxesLayout = getChartLayout(
      titledAxesInput,
      settings,
      false,
      640,
      360,
      chartContext,
    );
    expect(titledAxesLayout.padding.right).toBe(
      CHART_STYLE.padding.x +
        titledAxesLayout.ticksDimensions.yTicksWidthRight +
        fontSize +
        marginY,
    );
    expect(titledAxesLayout.internalInset).toEqual(basePadding);

    const hiddenAxesLayout = getChartLayout(
      titledAxesInput,
      createMockVisualizationSettings({
        ...settings,
        "graph.y_axis.axis_enabled": false,
      }),
      false,
      640,
      360,
      chartContext,
    );
    expect(hiddenAxesLayout.internalInset).toEqual({
      left: CHART_STYLE.padding.x + CHART_STYLE.hiddenYAxisWidth,
      right: CHART_STYLE.padding.x + CHART_STYLE.hiddenYAxisWidth,
    });
  });

  it("does not reserve x-axis room for a time series label the tick grid never draws", () => {
    const utc = (value: string) => dayjs.utc(value);
    const first = "2019-03-01";
    const getTimeSeriesInput = (last: string): ChartLayoutInput => ({
      ...input,
      xAxisModel: {
        axisType: "time",
        interval: { unit: "day", count: 1 },
        intervalsCount: utc(last).diff(utc(first), "day"),
        range: [utc(first), utc(last)],
        formatter: (value) => utc(String(value)).format("MMM D, YYYY"),
        toEChartsAxisValue: (value) =>
          utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
        fromEChartsAxisValue: (value) => dayjs.utc(value),
      },
      transformedDataset: [
        { [X_AXIS_DATA_KEY]: first, price: 1200 },
        { [X_AXIS_DATA_KEY]: last, price: 1800 },
      ],
    });
    const chartContext: RenderingContext = {
      ...getChartContext(),
      // Every date label is 90px wide, so a 400px chart fits three ticks.
      measureText: (text) => (/\d{4}/.test(text) ? 90 : 20),
    };
    const timeSeriesSettings = createMockVisualizationSettings({
      ...settings,
      "graph.x_axis.axis_enabled": true,
      "graph.x_axis.scale": "timeseries",
    });
    const getLayout = (last: string) =>
      getChartLayout(
        getTimeSeriesInput(last),
        timeSeriesSettings,
        false,
        400,
        300,
        chartContext,
      );

    // Yearly ticks end at January 2021, months before the data does, so the
    // last data point gets no label and its label width takes no room.
    expect(getLayout("2021-06-15").padding.right).toBe(CHART_STYLE.padding.x);

    // The room stays when the last tick does sit at the axis end.
    expect(getLayout("2021-01-01").padding.right).toBeGreaterThan(
      CHART_STYLE.padding.x,
    );
  });

  const getSmallestCardLayout = ({
    showValues = false,
    xAxisTitle,
  }: {
    showValues?: boolean;
    xAxisTitle?: string;
  }) => {
    const chartContext: RenderingContext = {
      ...getChartContext(),
      theme: getVisualizationTheme({
        theme: DEFAULT_METABASE_COMPONENT_THEME,
        cartesianSize: "small",
      }),
      measureText: (text) => text.length * 7,
    };
    const categories = ["Doohickey", "Gadget", "Gizmo", "Widget"];
    const chartLayout = getChartLayout(
      {
        ...input,
        xAxisModel: {
          ...xAxisModel,
          valuesCount: categories.length,
          label: xAxisTitle,
        },
        transformedDataset: categories.map((category) => ({
          [X_AXIS_DATA_KEY]: category,
          price: 1500,
        })),
      },
      createMockVisualizationSettings({
        ...settings,
        "graph.x_axis.axis_enabled": true,
        "graph.x_axis.scale": "ordinal",
        "graph.show_values": showValues,
      }),
      false,
      136,
      85,
      chartContext,
    );
    const plotHeight =
      chartLayout.outerHeight -
      chartLayout.padding.top -
      chartLayout.padding.bottom;
    return { chartLayout, plotHeight, chartContext };
  };

  it.each([
    { name: "nothing else", options: {} },
    { name: "data labels", options: { showValues: true } },
    { name: "an x-axis title", options: { xAxisTitle: "Category" } },
  ])(
    "keeps room for the min and max y-axis labels below rotated x-axis labels on the smallest card with $name",
    ({ options }) => {
      const { chartLayout, plotHeight, chartContext } =
        getSmallestCardLayout(options);
      const { fontSize } = chartContext.theme.cartesian.ticks;

      expect(chartLayout.axisEnabledSetting).toBe("rotate-90");
      expect(plotHeight).toBeGreaterThanOrEqual(fontSize * 2);
    },
  );

  it("gives rotated x-axis labels no room once data labels and the x-axis title fill the smallest card", () => {
    const { chartLayout, plotHeight, chartContext } = getSmallestCardLayout({
      showValues: true,
      xAxisTitle: "Category",
    });

    expect(chartLayout.ticksDimensions.xTickWidthCap).toBe(0);
    expect(chartLayout.ticksDimensions.xTicksHeight).toBe(
      chartContext.theme.cartesian.ticks.marginX,
    );
    expect(plotHeight).toBeGreaterThan(0);
  });

  it("reserves no room for x-axis labels the auto setting hides", () => {
    const chartContext: RenderingContext = {
      ...getChartContext(),
      measureText: (text) => text.length * 7,
    };
    const states = Array.from({ length: 50 }, (_, index) => `State ${index}`);
    const chartLayout = getChartLayout(
      {
        ...input,
        xAxisModel: { ...xAxisModel, valuesCount: states.length },
        transformedDataset: states.map((state) => ({
          [X_AXIS_DATA_KEY]: state,
          price: 1500,
        })),
      },
      createMockVisualizationSettings({
        ...settings,
        "graph.x_axis.axis_enabled": true,
        "graph.x_axis.scale": "ordinal",
      }),
      false,
      300,
      200,
      chartContext,
    );

    expect(chartLayout.axisEnabledSetting).toBe(false);
    expect(chartLayout.ticksDimensions.xTicksHeight).toBe(0);
    expect(chartLayout.padding.bottom).toBe(CHART_STYLE.padding.y);
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
