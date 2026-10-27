import {
  type ChartLayoutInput,
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
  X_AXIS_DATA_KEY,
} from "metabase/viz-core";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { type LegendChart, getLegendPlots } from "./plots";

const CATEGORY_COUNT = 20;
const LABEL_WIDTH = 40;
const ROW_LEGEND_HEIGHT = 30;

const layoutInput: ChartLayoutInput = {
  xAxisModel: {
    axisType: "category",
    isHistogram: false,
    valuesCount: CATEGORY_COUNT,
    formatter: (value) => String(value),
  },
  leftAxisModel: {
    seriesKeys: ["count"],
    extent: [0, 100],
    column: createMockColumn({ name: "count" }),
    formatter: (value) => String(value),
    formatGoal: (value) => String(value),
    splitNumber: 5,
  },
  rightAxisModel: null,
  yAxisScaleTransforms: {
    toEChartsAxisValue: (value) => (typeof value === "number" ? value : null),
    fromEChartsAxisValue: (value) => value,
  },
  dataset: Array.from({ length: CATEGORY_COUNT }, (_, index) => ({
    [X_AXIS_DATA_KEY]: `category ${index}`,
    count: index,
  })),
};

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => LABEL_WIDTH,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const chart: LegendChart = {
  layoutInput,
  settings: createMockVisualizationSettings({
    "graph.x_axis.axis_enabled": true,
    "graph.x_axis.scale": "ordinal",
    "graph.y_axis.axis_enabled": true,
  }),
  hasTimelineEvents: false,
  renderingContext,
};

describe("getLegendPlots", () => {
  const plots = getLegendPlots(chart, {
    none: { width: 600, height: 200 },
    row: { width: 600, height: 200 - ROW_LEGEND_HEIGHT },
    column: { width: 150, height: 200 },
  });

  it("should leave the plot what the axes do not take", () => {
    expect(plots.none.width).toBeLessThan(600);
    expect(plots.none.height).toBeLessThan(200);
    expect(plots.row.width).toBe(plots.none.width);
    expect(plots.row.height).toBe(plots.none.height - ROW_LEGEND_HEIGHT);
  });

  it("should report the y-axis indent a row legend lines up with", () => {
    expect(plots.none.indent).toBeGreaterThan(0);
    expect(plots.row.indent).toBe(plots.none.indent);
  });

  it("should report x-axis labels only where the chart has room for them", () => {
    expect(plots.none.hasXAxisLabels).toBe(true);
    expect(plots.row.hasXAxisLabels).toBe(true);
    expect(plots.column.hasXAxisLabels).toBe(false);
  });
});
