import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
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
});
