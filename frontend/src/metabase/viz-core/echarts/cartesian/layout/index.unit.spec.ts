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
    { name: "full-page", options: {}, fontSize: 14, marginX: 12, marginY: 24 },
    {
      name: "dashboard",
      options: { isDashboard: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      name: "large dashboard",
      options: {
        isDashboard: true,
        isLargeCard: true,
      },
      fontSize: 12,
      marginX: 8,
      marginY: 16,
    },
  ])(
    "measures and renders $name ticks with matching styles",
    ({ options, fontSize, marginX, marginY }) => {
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
        expect(axis.nameTextStyle?.fontSize).toBe(13);
      }
    },
  );

  describe.each([
    { name: "full-page", options: {} },
    { name: "dashboard", options: { isDashboard: true } },
    {
      name: "large dashboard",
      options: { isDashboard: true, isLargeCard: true },
    },
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
