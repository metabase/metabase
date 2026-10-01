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
      marginX: 12,
      marginY: 24,
      axisTitleFontSize: 14,
    },
    {
      name: "small",
      options: { cartesianSize: "small" as const },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
      axisTitleFontSize: 11,
    },
    {
      name: "medium",
      options: { cartesianSize: "medium" as const },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
      axisTitleFontSize: 12,
    },
    {
      name: "large",
      options: { cartesianSize: "large" as const },
      fontSize: 12,
      marginX: 8,
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
});

describe("x-axis endpoint label overflow", () => {
  const WIDE_LABEL_WIDTH = 400;
  const CHART_WIDTH = 640;
  const HIDDEN_Y_AXIS_PADDING =
    CHART_STYLE.padding.x + CHART_STYLE.hiddenYAxisWidth;
  const NO_AXIS_PADDING = CHART_STYLE.padding.x;
  const PLOT_WIDTH = CHART_WIDTH - HIDDEN_Y_AXIS_PADDING - NO_AXIS_PADDING;
  const MEDIUM_PLOT_INSET = 16;

  const getEdgeLabelContext = (): RenderingContext => ({
    ...getChartContext(),
    measureText: (text: string) => (text === "Wide" ? WIDE_LABEL_WIDTH : 20),
  });

  const edgeLabelSettings = createMockVisualizationSettings({
    ...settings,
    "graph.y_axis.axis_enabled": false,
    "graph.x_axis.axis_enabled": "compact",
  });

  const layoutFor = (chartInput: ChartLayoutInput) =>
    getChartLayout(
      chartInput,
      edgeLabelSettings,
      false,
      CHART_WIDTH,
      360,
      getEdgeLabelContext(),
    );

  it("does not shrink the plot for a wide first category label, which is aligned inward instead", () => {
    const categoryInput = {
      ...input,
      xAxisModel: { ...xAxisModel, valuesCount: 2 },
    };
    const wide = layoutFor({
      ...categoryInput,
      dataset: [
        { [X_AXIS_DATA_KEY]: "Wide", price: 1200 },
        { [X_AXIS_DATA_KEY]: "Beta", price: 1500 },
      ],
    });
    const narrow = layoutFor({
      ...categoryInput,
      dataset: [
        { [X_AXIS_DATA_KEY]: "Alpha", price: 1200 },
        { [X_AXIS_DATA_KEY]: "Beta", price: 1500 },
      ],
    });

    expect(wide.padding.left).toBe(narrow.padding.left);
    expect(wide.padding.left).toBe(HIDDEN_Y_AXIS_PADDING);
  });

  it("does not shrink the plot for a wide first time-series label, which is pinned inside the plot instead", () => {
    const timeInput: ChartLayoutInput = {
      ...input,
      xAxisModel: {
        axisType: "time",
        interval: { unit: "month", count: 1 },
        intervalsCount: 1,
        range: [dayjs.utc("2025-04-01"), dayjs.utc("2025-05-01")],
        formatter: (value) => (value === "2025-04-01" ? "Wide" : "Beta"),
        toEChartsAxisValue: (value) =>
          dayjs.utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
        fromEChartsAxisValue: (value) => dayjs.utc(value),
      },
      dataset: [
        { [X_AXIS_DATA_KEY]: "2025-04-01", price: 1200 },
        { [X_AXIS_DATA_KEY]: "2025-05-01", price: 1500 },
      ],
    };

    expect(layoutFor(timeInput).padding.left).toBe(HIDDEN_Y_AXIS_PADDING);
  });

  it("keeps a wide first numeric label the inset away from the plot edge", () => {
    const numericInput: ChartLayoutInput = {
      ...input,
      xAxisModel: {
        axisType: "value",
        extent: [0, 1],
        interval: 1,
        intervalsCount: 1,
        isPadded: true,
        formatter: (value) => (value === 0 ? "Wide" : "Beta"),
        toEChartsAxisValue: (value) => Number(value),
        fromEChartsAxisValue: (value) => value,
      },
      dataset: [
        { [X_AXIS_DATA_KEY]: 0, price: 1200 },
        { [X_AXIS_DATA_KEY]: 1, price: 1500 },
      ],
    };
    const dimensionWidth = PLOT_WIDTH / 2;
    const expectedOverflow =
      WIDE_LABEL_WIDTH / 2 -
      dimensionWidth / 2 -
      HIDDEN_Y_AXIS_PADDING +
      MEDIUM_PLOT_INSET;

    const layout = layoutFor(numericInput);

    expect(layout.padding.left).toBe(HIDDEN_Y_AXIS_PADDING + expectedOverflow);
  });
});
