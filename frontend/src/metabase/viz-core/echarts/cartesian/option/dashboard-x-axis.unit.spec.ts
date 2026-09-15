import { BarChart, CustomChart, LineChart } from "echarts/charts";
import {
  BrushComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  ToolboxComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { platformApi } from "zrender/lib/core/platform.js";

import {
  measureTextEChartsAdapter,
  measureTextWidth,
} from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import { color } from "metabase/ui/colors";
import type {
  DatasetColumn,
  RowValue,
  SeriesSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockInsight,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { getChartLayout } from "../layout";
import { getCartesianChartModel } from "../model";
import type { LegacySeriesSettingsObjectKey } from "../model/types";

import { getXAxisLabelPadding, getXAxisWidth } from "./x-axis-padding";

import { getCartesianChartOption } from ".";

echarts.use([
  BarChart,
  CustomChart,
  LineChart,
  BrushComponent,
  DatasetComponent,
  GridComponent,
  GraphicComponent,
  ToolboxComponent,
  SVGRenderer,
]);

const categories = ["First", "Middle", "Last"];
const chartHeight = 400;
const renderingContext: RenderingContext = {
  getColor: color,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_text, style) => Number(style.size) * 1.3,
  fontFamily: "Lato",
  theme: {
    ...DEFAULT_VISUALIZATION_THEME,
    cartesian: {
      ...DEFAULT_VISUALIZATION_THEME.cartesian,
      ticks: { fontSize: 12, marginX: 8, marginY: 12 },
    },
  },
};

type ChartCase = {
  name: string;
  displays: NonNullable<SeriesSettings["display"]>[];
  stackType?: ComputedVisualizationSettings["stackable.stack_type"];
  split?: boolean;
};
const chartCases: ChartCase[] = [
  { name: "line", displays: ["line"] },
  { name: "area", displays: ["area"] },
  { name: "bar", displays: ["bar"] },
  { name: "grouped bars", displays: ["bar", "bar"] },
  { name: "stacked bars", displays: ["bar", "bar"], stackType: "stacked" },
  { name: "combo", displays: ["line", "bar"] },
  { name: "split panels", displays: ["line", "bar"], split: true },
  {
    name: "normalized bars",
    displays: ["bar", "bar"],
    stackType: "normalized",
  },
];

type FixtureOptions = {
  width: number;
  chartCase: ChartCase;
  dashboard?: boolean;
  dashboardOverride?: boolean;
  categoryValues?: string[];
  axisEnabled?: ComputedVisualizationSettings["graph.x_axis.axis_enabled"];
  widthIsOuter?: boolean;
  histogram?: boolean;
  histogramStart?: number;
  dates?: boolean;
  showLabels?: boolean;
  goal?: boolean;
  trend?: boolean;
};

function setup({
  width,
  chartCase,
  dashboard = true,
  dashboardOverride,
  categoryValues = categories,
  axisEnabled = true,
  widthIsOuter = false,
  histogram = false,
  histogramStart = 1,
  dates = false,
  showLabels = false,
  goal = false,
  trend = false,
}: FixtureOptions) {
  const values: RowValue[] = categoryValues.map((category, index) => {
    if (histogram) {
      return index + histogramStart;
    }
    if (dates) {
      return dayjs.utc("2025-01-01").add(index, "month").toISOString();
    }
    return category;
  });
  let dimensionBaseType: DatasetColumn["base_type"] = "type/Text";
  if (histogram) {
    dimensionBaseType = "type/Integer";
  } else if (dates) {
    dimensionBaseType = "type/DateTime";
  }
  const metricNames = chartCase.displays.map((_, index) => `metric${index}`);
  const settings = createMockVisualizationSettings({
    "graph.dimensions": ["category"],
    "graph.metrics": metricNames,
    "graph.x_axis.scale": histogram ? "histogram" : "ordinal",
    "graph.x_axis.axis_enabled": axisEnabled,
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.scale": "linear",
    "graph.y_axis.axis_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.y_axis.auto_range": true,
    "graph.show_values": showLabels,
    "graph.label_value_frequency": "all",
    "graph.label_value_formatting": "full",
    "graph.show_goal": goal,
    "graph.goal_value": 15,
    "graph.goal_label": "Target",
    "graph.show_trendline": trend,
    "graph.split_panels": chartCase.split,
    "stackable.stack_type": chartCase.stackType,
    column: (column: DatasetColumn) => ({ column }),
    series: ({ card }: LegacySeriesSettingsObjectKey) => ({
      display:
        chartCase.displays[
          metricNames.findIndex((name) => name === card._seriesKey)
        ],
      show_series_values: showLabels,
    }),
  });
  const model = getCartesianChartModel(
    [
      {
        card: createMockCard({ id: 1, display: "line" }),
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "category",
              base_type: dimensionBaseType,
              unit: dates ? "month" : undefined,
            }),
            ...metricNames.map((name) =>
              createMockColumn({
                name,
                base_type: "type/Integer",
                semantic_type: "type/Quantity",
              }),
            ),
          ],
          rows: values.map((value, index) => [
            value,
            ...metricNames.map(
              (_, metricIndex) => (index + 1) * 10 + metricIndex * 5,
            ),
          ]),
          insights: trend
            ? metricNames.map((col) =>
                createMockInsight({ col, unit: "month", slope: 0, offset: 15 }),
              )
            : undefined,
        }),
      },
    ],
    settings,
    [],
    renderingContext,
    undefined,
    dashboard ? { width: 12, height: 8 } : undefined,
    dashboardOverride,
  );
  let outerWidth = width;
  let layout = getChartLayout(
    model,
    settings,
    false,
    outerWidth,
    chartHeight,
    renderingContext,
  );
  if (!widthIsOuter) {
    outerWidth += width - getXAxisWidth(layout);
    layout = getChartLayout(
      model,
      settings,
      false,
      outerWidth,
      chartHeight,
      renderingContext,
    );
  }
  const option = getCartesianChartOption(
    model,
    layout,
    false,
    null,
    [],
    settings,
    outerWidth,
    false,
    renderingContext,
  );
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: outerWidth,
    height: chartHeight,
  });
  chart.setOption(option);
  chart.renderToSVGString();
  return {
    chart,
    model,
    layout,
    option,
    settings,
    outerWidth,
    values,
    gridLeft: layout.padding.left,
    gridRight: outerWidth - layout.padding.right,
  };
}

type ChartDisplayable = ReturnType<
  ReturnType<echarts.EChartsType["getZr"]>["storage"]["getDisplayList"]
>[number];

function bounds(element: ChartDisplayable) {
  const rectangle = element.getBoundingRect().clone();
  if (element.transform) {
    rectangle.applyTransform(element.transform);
  }
  return rectangle;
}
function getTextBounds(chart: echarts.EChartsType, text: string) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => {
      const value: unknown = element.style.text;
      return (
        element.type === "tspan" &&
        typeof value === "string" &&
        value.trim() === text
      );
    })
    .map(bounds);
}
function getBarBounds(chart: echarts.EChartsType) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => element.type === "rect")
    .map(bounds)
    .filter((rectangle) => rectangle.width > 1 && rectangle.height > 1);
}
function getLineXs(chart: echarts.EChartsType) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => element.type === "ec-polyline")
    .map((element) => {
      if (!("shape" in element)) {
        return [];
      }
      const shape: unknown = element.shape;
      if (
        typeof shape !== "object" ||
        shape === null ||
        !("points" in shape) ||
        !(shape.points instanceof Float32Array)
      ) {
        return [];
      }
      return Array.from(shape.points).filter((_, index) => index % 2 === 0);
    });
}

const fallbackCases: Pick<
  FixtureOptions,
  "width" | "categoryValues" | "axisEnabled"
>[] = [
  {
    width: 160,
    categoryValues: ["One category with a very long descriptive label"],
    axisEnabled: "compact",
  },
  {
    width: 300,
    categoryValues: [
      "The first category has an exceptionally long label",
      "The final category also has an exceptionally long label",
    ],
    axisEnabled: "compact",
  },
  {
    width: 80,
    categoryValues: ["First category", "Last category"],
    axisEnabled: "compact",
  },
  {
    width: 220,
    categoryValues: ["First long category", "Last long category"],
    axisEnabled: "rotate-45",
  },
  {
    width: 220,
    categoryValues: ["First long category", "Last long category"],
    axisEnabled: "rotate-90",
  },
  {
    width: 220,
    categoryValues: ["First long category", "Last long category"],
    axisEnabled: false,
  },
];

function getXAxisGeometry(
  chart: echarts.EChartsType,
  categoryValues: string[],
  projected: boolean,
) {
  return {
    points: categoryValues.map((value, index) =>
      chart.convertToPixel({ xAxisIndex: 0 }, projected ? index : value),
    ),
    labels: categoryValues.flatMap((text) =>
      getTextBounds(chart, text).map((rectangle) => ({
        text,
        x: rectangle.x,
        width: rectangle.width,
      })),
    ),
    lines: getLineXs(chart),
    bars: getBarBounds(chart).map((rectangle) => ({
      x: rectangle.x,
      width: rectangle.width,
    })),
  };
}

const previousMeasureText = platformApi.measureText;
beforeEach(() =>
  echarts.setPlatformAPI({ measureText: measureTextEChartsAdapter }),
);
afterEach(() => echarts.setPlatformAPI({ measureText: previousMeasureText }));

describe("dashboard X-axis rendering", () => {
  it.each(fallbackCases)(
    "preserves native overflow when $axisEnabled endpoints cannot use dashboard padding at $width px (UXW-5182)",
    (fixture) => {
      const input = {
        ...fixture,
        chartCase: chartCases[2],
        widthIsOuter: true,
      };
      const dashboard = setup(input);
      const standalone = setup({ ...input, dashboard: false });
      const categoryValues = fixture.categoryValues ?? categories;
      try {
        expect(dashboard.layout.dashboardXAxis).toBeUndefined();
        expect(standalone.layout.dashboardXAxis).toBeUndefined();
        expect(dashboard.layout.padding).toEqual(standalone.layout.padding);
        expect(
          getXAxisGeometry(dashboard.chart, categoryValues, false),
        ).toEqual(getXAxisGeometry(standalone.chart, categoryValues, false));
      } finally {
        dashboard.chart.dispose();
        standalone.chart.dispose();
      }
    },
  );

  it("preserves standalone category placement when its flag overrides grid dimensions", () => {
    const input = { width: 900, chartCase: chartCases[2] };
    const standaloneWithGrid = setup({ ...input, dashboardOverride: false });
    const standalone = setup({ ...input, dashboard: false });
    try {
      expect(standaloneWithGrid.model.xAxisModel.isDashboard).toBe(false);
      expect(standaloneWithGrid.layout.dashboardXAxis).toBeUndefined();
      expect(
        getXAxisGeometry(standaloneWithGrid.chart, categories, false),
      ).toEqual(getXAxisGeometry(standalone.chart, categories, false));
    } finally {
      standaloneWithGrid.chart.dispose();
      standalone.chart.dispose();
    }
  });

  it.each([
    ...[299, 300, 899, 900].map((width) => ({
      width,
      categoryValues: categories,
      axisEnabled: true,
      widthIsOuter: false,
    })),
    { ...fallbackCases[1], widthIsOuter: true },
  ] satisfies Pick<
    FixtureOptions,
    "width" | "categoryValues" | "axisEnabled" | "widthIsOuter"
  >[])(
    "keeps pixel geometry stable when laying out the same $width px chart twice (UXW-5182)",
    (fixture) => {
      const result = setup({
        ...fixture,
        chartCase: chartCases[2],
      });
      const categoryValues = fixture.categoryValues ?? categories;
      try {
        const firstGeometry = getXAxisGeometry(
          result.chart,
          categoryValues,
          result.layout.dashboardXAxis !== undefined,
        );
        const secondLayout = getChartLayout(
          result.model,
          result.settings,
          false,
          result.outerWidth,
          chartHeight,
          renderingContext,
        );
        const secondOption = getCartesianChartOption(
          result.model,
          secondLayout,
          false,
          null,
          [],
          result.settings,
          result.outerWidth,
          false,
          renderingContext,
        );
        result.chart.setOption(secondOption, { notMerge: true });
        result.chart.renderToSVGString();
        expect(secondLayout.padding).toEqual(result.layout.padding);
        expect(
          getXAxisGeometry(
            result.chart,
            categoryValues,
            secondLayout.dashboardXAxis !== undefined,
          ),
        ).toEqual(firstGeometry);
      } finally {
        result.chart.dispose();
      }
    },
  );

  it.each(
    chartCases.flatMap((chartCase) =>
      [299, 300, 899, 900].map((width) => ({
        chartCase,
        width,
        name: chartCase.name,
      })),
    ),
  )(
    "pads the outermost endpoint elements for $name with a $width px plot",
    ({ chartCase, width }) => {
      const { chart, model, layout, gridLeft, gridRight } = setup({
        width,
        chartCase,
      });
      try {
        expect(getXAxisWidth(layout)).toBeCloseTo(width, 5);
        expect(layout.dashboardXAxis).toBeDefined();
        const firstLabels = getTextBounds(chart, "First");
        const lastLabels = getTextBounds(chart, "Last");
        const padding = getXAxisLabelPadding(width);
        expect(firstLabels).toHaveLength(1);
        expect(lastLabels).toHaveLength(1);
        const bars = getBarBounds(chart);
        const barSeriesCount = chartCase.displays.filter(
          (display) => display === "bar",
        ).length;
        const firstPoint = chart.convertToPixel({ xAxisIndex: 0 }, 0);
        const lastPoint = chart.convertToPixel({ xAxisIndex: 0 }, 2);
        const firstLabelX =
          barSeriesCount > 0
            ? firstPoint - firstLabels[0].width / 2
            : gridLeft + padding;
        const lastLabelX =
          barSeriesCount > 0
            ? lastPoint - lastLabels[0].width / 2
            : gridRight - padding - lastLabels[0].width;
        expect(firstLabels[0].x).toBeCloseTo(firstLabelX, 3);
        expect(lastLabels[0].x).toBeCloseTo(lastLabelX, 3);
        const firstVisibleEdge = Math.min(
          firstLabels[0].x,
          ...bars.map((bar) => bar.x),
        );
        const lastVisibleEdge = Math.max(
          lastLabels[0].x + lastLabels[0].width,
          ...bars.map((bar) => bar.x + bar.width),
        );
        expect(firstVisibleEdge - gridLeft).toBeCloseTo(padding, 3);
        expect(gridRight - lastVisibleEdge).toBeCloseTo(padding, 3);
        const axesCount = chartCase.split ? chartCase.displays.length : 1;
        for (let axisIndex = 0; axisIndex < axesCount; axisIndex++) {
          const firstPoint = chart.convertToPixel({ xAxisIndex: axisIndex }, 0);
          const lastPoint = chart.convertToPixel({ xAxisIndex: axisIndex }, 2);
          expect(firstPoint).toBeGreaterThan(gridLeft);
          expect(lastPoint).toBeLessThan(gridRight);
          expect(firstPoint - gridLeft).toBeCloseTo(gridRight - lastPoint, 3);
          expect(Math.abs(firstPoint - gridLeft - width / 6)).toBeGreaterThan(
            1,
          );
        }
        expect(model.dataset.map((datum) => datum[X_AXIS_DATA_KEY])).toEqual(
          categories,
        );
        expect(bars).toHaveLength(barSeriesCount * 3);
        for (const bar of bars) {
          expect(bar.x).toBeGreaterThanOrEqual(gridLeft - 0.1);
          expect(bar.x + bar.width).toBeLessThanOrEqual(gridRight + 0.1);
          expect(bar.width).toBeCloseTo(bars[0].width, 2);
        }
        const lines = getLineXs(chart);
        expect(lines).toHaveLength(
          chartCase.displays.filter(
            (display) => display === "line" || display === "area",
          ).length,
        );
        for (const line of lines) {
          expect(line).toHaveLength(3);
          expect(line[0]).toBeCloseTo(
            chart.convertToPixel({ xAxisIndex: 0 }, 0),
            3,
          );
          expect(line[2]).toBeCloseTo(
            chart.convertToPixel({ xAxisIndex: 0 }, 2),
            3,
          );
        }
      } finally {
        chart.dispose();
      }
    },
  );

  it.each([
    {
      name: "wider bar groups",
      categoryValues: categories,
      firstLabelWider: false,
      lastLabelWider: false,
    },
    {
      name: "wider endpoint labels",
      categoryValues: [
        "First category has a much wider label",
        ...Array.from({ length: 8 }, (_, index) => `Category ${index + 2}`),
        "Last category also has a much wider label",
      ],
      firstLabelWider: true,
      lastLabelWider: true,
    },
    {
      name: "different endpoint widths",
      categoryValues: [
        "First category has a much wider label",
        ...Array.from({ length: 8 }, (_, index) => `Category ${index + 2}`),
        "Last",
      ],
      firstLabelWider: true,
      lastLabelWider: false,
    },
  ])(
    "centers combo endpoint labels and pads the outermost visible edge for $name (UXW-5182)",
    ({ categoryValues, firstLabelWider, lastLabelWider }) => {
      const { chart, layout, gridLeft, gridRight } = setup({
        width: 900,
        chartCase: { name: "grouped combo", displays: ["bar", "bar", "line"] },
        categoryValues,
        axisEnabled: "compact",
      });
      try {
        expect(layout.dashboardXAxis).toBeDefined();
        const firstLabels = getTextBounds(chart, categoryValues[0]);
        const lastLabels = getTextBounds(
          chart,
          categoryValues[categoryValues.length - 1],
        );
        expect(firstLabels).toHaveLength(1);
        expect(lastLabels).toHaveLength(1);
        const bars = getBarBounds(chart).sort(
          (left, right) => left.x - right.x,
        );
        expect(bars).toHaveLength(categoryValues.length * 2);
        const firstGroupLeft = Math.min(
          ...bars.slice(0, 2).map((bar) => bar.x),
        );
        const firstGroupRight = Math.max(
          ...bars.slice(0, 2).map((bar) => bar.x + bar.width),
        );
        const lastGroupLeft = Math.min(...bars.slice(-2).map((bar) => bar.x));
        const lastGroupRight = Math.max(
          ...bars.slice(-2).map((bar) => bar.x + bar.width),
        );
        const firstGroupWidth = firstGroupRight - firstGroupLeft;
        const lastGroupWidth = lastGroupRight - lastGroupLeft;
        const firstCenter = chart.convertToPixel({ xAxisIndex: 0 }, 0);
        const lastCenter = chart.convertToPixel(
          { xAxisIndex: 0 },
          categoryValues.length - 1,
        );
        expect(firstLabels[0].x + firstLabels[0].width / 2).toBeCloseTo(
          firstCenter,
          3,
        );
        expect(lastLabels[0].x + lastLabels[0].width / 2).toBeCloseTo(
          lastCenter,
          3,
        );
        expect((firstGroupLeft + firstGroupRight) / 2).toBeCloseTo(
          firstCenter,
          3,
        );
        expect((lastGroupLeft + lastGroupRight) / 2).toBeCloseTo(lastCenter, 3);
        expect(firstLabels[0].width > firstGroupWidth).toBe(firstLabelWider);
        expect(lastLabels[0].width > lastGroupWidth).toBe(lastLabelWider);
        expect(firstCenter - gridLeft).toBeCloseTo(
          24 + Math.max(firstLabels[0].width, firstGroupWidth) / 2,
          3,
        );
        expect(gridRight - lastCenter).toBeCloseTo(
          24 + Math.max(lastLabels[0].width, lastGroupWidth) / 2,
          3,
        );
        const line = getLineXs(chart);
        expect(line).toHaveLength(1);
        expect(line[0][0]).toBeCloseTo(firstCenter, 3);
        expect(line[0][line[0].length - 1]).toBeCloseTo(lastCenter, 3);
      } finally {
        chart.dispose();
      }
    },
  );

  it.each([299, 300, 899, 900])(
    "renders histogram bin boundaries with a %i px plot",
    (width) => {
      const { chart, layout, gridLeft, gridRight } = setup({
        width,
        chartCase: { name: "histogram", displays: ["bar"] },
        histogram: true,
        histogramStart: 9,
      });
      try {
        expect(layout.dashboardXAxis).toBeDefined();
        const first = getTextBounds(chart, "9");
        const last = getTextBounds(chart, "12");
        expect(first).toHaveLength(1);
        expect(last).toHaveLength(1);
        expect(first[0].x + first[0].width / 2).toBeCloseTo(
          chart.convertToPixel({ xAxisIndex: 0 }, 0.5),
          3,
        );
        expect(last[0].x + last[0].width / 2).toBeCloseTo(
          chart.convertToPixel({ xAxisIndex: 0 }, 3.5),
          3,
        );
        expect(first[0].x - gridLeft).toBeCloseTo(
          getXAxisLabelPadding(width),
          3,
        );
        expect(gridRight - last[0].x - last[0].width).toBeCloseTo(
          getXAxisLabelPadding(width),
          3,
        );
        const bars = getBarBounds(chart).sort(
          (left, right) => left.x - right.x,
        );
        expect(bars).toHaveLength(3);
        for (let index = 0; index < bars.length; index++) {
          expect(bars[index].x + bars[index].width / 2).toBeCloseTo(
            chart.convertToPixel({ xAxisIndex: 0 }, index + 1),
            3,
          );
          expect(bars[index].width).toBeCloseTo(bars[0].width, 3);
        }
        expect(bars[0].x).toBeGreaterThanOrEqual(gridLeft);
        expect(bars[2].x + bars[2].width).toBeLessThanOrEqual(gridRight);
      } finally {
        chart.dispose();
      }
    },
  );

  it("keeps data labels centered above moved points", () => {
    const { chart } = setup({
      width: 900,
      chartCase: chartCases[0],
      showLabels: true,
    });
    try {
      for (const [index, value] of [10, 20, 30].entries()) {
        const labels = getTextBounds(chart, String(value));
        expect(labels).toHaveLength(1);
        expect(labels[0].x + labels[0].width / 2).toBeCloseTo(
          chart.convertToPixel({ xAxisIndex: 0 }, index),
          2,
        );
      }
    } finally {
      chart.dispose();
    }
  });

  it("keeps goal and trend lines visible with ordinal date categories", () => {
    const { chart, model, gridLeft, gridRight } = setup({
      width: 900,
      chartCase: chartCases[0],
      dates: true,
      goal: true,
      trend: true,
    });
    try {
      expect(model.trendLinesModel).toBeDefined();
      const lines = getLineXs(chart);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toEqual(lines[0]);
      const goalLines = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter(
          (element) =>
            element.type === "line" &&
            Array.isArray(element.style.lineDash) &&
            element.style.lineDash.join(",") === "3,4",
        );
      expect(goalLines).toHaveLength(1);
      const goal = bounds(goalLines[0]);
      expect(goal.x).toBeLessThanOrEqual(gridLeft);
      expect(goal.x + goal.width).toBeGreaterThanOrEqual(gridRight);
    } finally {
      chart.dispose();
    }
  });

  it.each([chartCases[0], chartCases[2]])(
    "preserves native category placement outside dashboards for $name",
    (chartCase) => {
      const { chart, layout, gridLeft } = setup({
        width: 900,
        chartCase,
        dashboard: false,
      });
      try {
        expect(layout.dashboardXAxis).toBeUndefined();
        const firstPoint = chart.convertToPixel({ xAxisIndex: 0 }, "First");
        expect(firstPoint - gridLeft).toBeCloseTo(900 / 6, 3);
        const first = getTextBounds(chart, "First");
        expect(first).toHaveLength(1);
        expect(first[0].x + first[0].width / 2).toBeCloseTo(firstPoint, 3);
        const positions = [
          ...getBarBounds(chart).map((bar) => bar.x + bar.width / 2),
          ...getLineXs(chart).flat(),
        ].sort((left, right) => left - right);
        expect(positions).toHaveLength(3);
        expect(positions[0]).toBeCloseTo(firstPoint, 3);
        expect(positions[2] - gridLeft).toBeCloseTo((900 * 5) / 6, 3);
      } finally {
        chart.dispose();
      }
    },
  );
});
