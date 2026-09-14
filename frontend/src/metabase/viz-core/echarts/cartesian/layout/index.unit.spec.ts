import { createMockChartContext } from "__support__/echarts";
import type { VisualizationSettings } from "metabase-types/api";
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

const getChartContext = () =>
  createMockChartContext({
    measureText: jest.fn((text: string) => {
      if (text === "$720.00") {
        return WIDEST_MEASURED_TICK_WIDTH;
      }

      return 20;
    }),
  });

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

  it("does not widen the y-axis gutter for a goal on a normalized stack (metabase#82424)", () => {
    const formatPercent = (value: unknown) =>
      `${Math.round(Number(value) * 100)}%`;
    const normalizedInput: ChartLayoutInput = {
      ...input,
      leftAxisModel: {
        ...yAxisModel,
        extent: [0, 1],
        isNormalized: true,
        formatter: formatPercent,
        formatGoal: formatPercent,
      },
    };
    const getLeftTicksWidth = (goalSettings: VisualizationSettings) =>
      getChartLayout(
        normalizedInput,
        createMockVisualizationSettings({ ...settings, ...goalSettings }),
        false,
        480,
        274,
        createMockChartContext({ measureText: (text) => text.length * 8 }),
      ).ticksDimensions.yTicksWidthLeft;

    // the user enters 100 for 100%, which is no wider than the widest tick
    expect(
      getLeftTicksWidth({ "graph.show_goal": true, "graph.goal_value": 100 }),
    ).toBe(getLeftTicksWidth({ "graph.show_goal": false }));
  });
});
