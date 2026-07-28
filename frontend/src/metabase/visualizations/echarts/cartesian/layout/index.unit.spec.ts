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

  describe("rtl", () => {
    const layoutFor = (direction: "ltr" | "rtl") =>
      getChartLayout(input, currencySettings, false, 480, 274, {
        ...getChartContext(),
        direction,
      });

    it("reserves the y-axis gutter on the side the axis is drawn", () => {
      const ltr = layoutFor("ltr");
      const rtl = layoutFor("rtl");

      // The left axis model renders on the right under rtl, so its gutter has to
      // move with it — otherwise the tick labels are painted outside the chart.
      expect(rtl.padding.right).toBe(ltr.padding.left);
      expect(rtl.padding.left).toBe(ltr.padding.right);
    });

    it("keeps the plot area the same size", () => {
      const ltr = layoutFor("ltr");
      const rtl = layoutFor("rtl");

      expect(rtl.bounds.right - rtl.bounds.left).toBe(
        ltr.bounds.right - ltr.bounds.left,
      );
      expect(rtl.bounds.bottom - rtl.bounds.top).toBe(
        ltr.bounds.bottom - ltr.bounds.top,
      );
    });

    it("mirrors the plot area within the chart", () => {
      const width = 480;
      const ltr = layoutFor("ltr");
      const rtl = layoutFor("rtl");

      expect(rtl.bounds.left).toBe(width - ltr.bounds.right);
      expect(rtl.bounds.right).toBe(width - ltr.bounds.left);
    });
  });
});
