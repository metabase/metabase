import {
  type ChartLayoutInput,
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
  X_AXIS_DATA_KEY,
  getCartesianChartModel,
} from "metabase/viz-core";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { type LegendChart, getLegendPlots, getPlotsWithoutAxes } from "./plots";

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

  it("should pass the chart's internal inset through", () => {
    expect(plots.none.internalInset.left).toBeGreaterThan(0);
    expect(plots.none.internalInset.right).toBeGreaterThan(0);
    expect(plots.row.internalInset).toEqual(plots.none.internalInset);
  });
});

describe("getPlotsWithoutAxes", () => {
  it("should report no internal inset", () => {
    const size = { width: 600, height: 200 };
    const plots = getPlotsWithoutAxes({ none: size, row: size, column: size });

    expect(plots.none.internalInset).toEqual({ left: 0, right: 0 });
  });
});

describe("getLegendPlots on a row chart", () => {
  const CHAR_WIDTH = 6;
  const ROW_COUNT = 10;
  const LONG_LABEL = "a category name long enough to take half the chart";

  const rowSettings = createMockVisualizationSettings({
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": "ordinal",
    series: () => ({ display: "bar" }),
  });
  const rowRenderingContext: RenderingContext = {
    ...renderingContext,
    measureText: (text) => text.length * CHAR_WIDTH,
  };
  const labels = Array.from({ length: ROW_COUNT }, (_, index) =>
    index === ROW_COUNT - 1 ? LONG_LABEL : `C${index}`,
  );
  const chartModel = getCartesianChartModel(
    [
      {
        card: createMockCard({ display: "row" }),
        data: createMockDatasetData({
          rows: labels.map((label) => [label, 1]),
          cols: [
            createMockColumn({ name: "CATEGORY", base_type: "type/Text" }),
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
        }),
      },
    ],
    rowSettings,
    [],
    rowRenderingContext,
  );

  it("should lay out only the rows the chart keeps at each height", () => {
    const plots = getLegendPlots(
      {
        chartModel,
        settings: rowSettings,
        hasTimelineEvents: false,
        renderingContext: rowRenderingContext,
      },
      // ten rows need 10 * 24px, so only the row candidate folds
      {
        none: { width: 600, height: 240 },
        row: { width: 600, height: 240 - ROW_LEGEND_HEIGHT },
        column: { width: 450, height: 240 },
      },
    );

    // the long last row folds into "Other" only under a bottom legend
    expect(plots.row.width - plots.none.width).toBeGreaterThan(150);
  });
});
