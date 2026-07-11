import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { CHART_STYLE } from "../constants/style";
import type { XAxisModel, YAxisModel } from "../model/types";

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
      WIDEST_MEASURED_TICK_WIDTH + CHART_STYLE.axisTicksMarginY,
    );
    expect(chartLayout.ticksDimensions.yTicksWidthLeft).not.toBe(
      WIDEST_MEASURED_TICK_WIDTH +
        CHART_STYLE.axisTicksMarginY +
        CHART_STYLE.padding.x,
    );
  });

  it("measures the actual low-percentage tick labels instead of rounded ones (metabase#55853)", () => {
    const formatPercent = (value: unknown) =>
      `${(Number(value) * 100).toFixed(2)}%`;

    const percentAxisModel: YAxisModel = {
      seriesKeys: ["value"],
      extent: [0, 0.0002],
      column: createMockColumn({ name: "value" }),
      formatter: formatPercent,
      formatGoal: formatPercent,
      splitNumber: 5,
    };

    const percentInput: ChartLayoutInput = {
      ...input,
      leftAxisModel: percentAxisModel,
    };

    const percentSettings = createMockVisualizationSettings({
      ...settings,
      column: () => ({ number_style: "percent" }),
    });

    // The widest actual label the axis will show is "0.02%" (0.0002 as a
    // percent). If the measurement rounds low percentages to the hundredth
    // before formatting, this label is never measured and the reserved y-axis
    // width is too small, letting the labels collide with the axis.
    const WIDE = 64;
    const measureText = jest.fn((text: string) =>
      text === "0.02%" ? WIDE : 20,
    );

    const chartContext: RenderingContext = {
      getColor: (name) => name,
      measureText,
      measureTextHeight: () => 0,
      fontFamily: "",
      theme: DEFAULT_VISUALIZATION_THEME,
    };

    const chartLayout = getChartLayout(
      percentInput,
      percentSettings,
      false,
      480,
      274,
      chartContext,
    );

    expect(measureText).toHaveBeenCalledWith("0.02%", expect.anything());
    expect(chartLayout.ticksDimensions.yTicksWidthLeft).toBe(
      WIDE + CHART_STYLE.axisTicksMarginY,
    );
  });
});
