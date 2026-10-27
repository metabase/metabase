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

  it("leaves a drawn x-axis label's overhang out of the internal inset", () => {
    const utc = (value: string) => dayjs.utc(value);
    const getTimeSeriesInput = (last: string): ChartLayoutInput => ({
      ...input,
      xAxisModel: {
        axisType: "time",
        interval: { unit: "month", count: 1 },
        intervalsCount: utc(last).diff(utc("2025-02-01"), "month"),
        range: [utc("2025-02-01"), utc(last)],
        formatter: (value) => utc(String(value)).format("MMMM YYYY"),
        toEChartsAxisValue: (value) =>
          utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
        fromEChartsAxisValue: (value) => dayjs.utc(value),
      },
      transformedDataset: [
        { [X_AXIS_DATA_KEY]: "2025-02-01", price: 1200 },
        { [X_AXIS_DATA_KEY]: last, price: 1800 },
      ],
    });
    const chartContext: RenderingContext = {
      ...getChartContext(),
      measureText: (text) => (/\d{4}/.test(text) ? 80 : 20),
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
        480,
        300,
        chartContext,
      );

    // The data ends on the January 2029 tick, so its label is drawn half a
    // month from the plot's right edge and reaches into the reserved padding.
    const drawn = getLayout("2029-01-01");
    expect(drawn.internalInset.right).toBeGreaterThan(0);
    expect(drawn.internalInset.right).toBeLessThan(CHART_STYLE.padding.x);

    // The data ends in June, so the January label sits well inside the plot
    // and the padding stays empty.
    const inside = getLayout("2029-06-01");
    expect(inside.internalInset.right).toBe(inside.padding.right);
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
});
