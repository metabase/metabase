import {
  BoxplotChart,
  CustomChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  BrushComponent,
  DatasetComponent,
  GridComponent,
  ToolboxComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { platformApi } from "zrender/lib/core/platform.js";

import {
  createMockChartLayout,
  measureTextEChartsAdapter,
  measureTextWidth,
} from "__support__/echarts";
import type { DatasetColumn } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { X_AXIS_POSITION_KEY } from "../../cartesian/constants/dataset";
import { getXAxisLabelPadding } from "../../cartesian/option/x-axis-padding";
import { getBoxPlotLayoutModel } from "../layout";
import { getBoxPlotModel } from "../model";

import { getBoxPlotOption } from ".";

echarts.use([
  BoxplotChart,
  CustomChart,
  LineChart,
  ScatterChart,
  DatasetComponent,
  GridComponent,
  BrushComponent,
  ToolboxComponent,
  SVGRenderer,
]);

const renderingContext: RenderingContext = {
  getColor: () => "#509ee3",
  fontFamily: "Lato",
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: () => 14,
  theme: {
    ...DEFAULT_VISUALIZATION_THEME,
    cartesian: {
      ...DEFAULT_VISUALIZATION_THEME.cartesian,
      ticks: { ...DEFAULT_VISUALIZATION_THEME.cartesian.ticks, fontSize: 12 },
    },
  },
};

const categories = ["First", "Middle", "Last category"];

function getScenario(width: number, isDashboard: boolean, seriesCount: number) {
  const dimension = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  const metrics = Array.from({ length: seriesCount }, (_, index) =>
    createMockColumn({
      name: `value${index}`,
      base_type: "type/Integer",
      semantic_type: "type/Quantity",
    }),
  );
  const settings = createMockVisualizationSettings({
    "graph.dimensions": [dimension.name],
    "graph.metrics": metrics.map((metric) => metric.name),
    "graph.x_axis.scale": "ordinal",
    "graph.x_axis.axis_enabled": true,
    "graph.y_axis.scale": "linear",
    "graph.y_axis.auto_split": false,
    "graph.show_values": true,
    "graph.show_goal": true,
    "graph.goal_value": 15,
    "graph.goal_label": "Revenue goal",
    "boxplot.whisker_type": "tukey",
    "boxplot.points_mode": "all",
    "boxplot.show_mean": true,
    "boxplot.show_values_mode": "all",
    column: (column: DatasetColumn) => ({ column }),
    series: () => ({ display: "boxplot" }),
  });
  const model = getBoxPlotModel(
    [
      {
        card: createMockCard({ id: 1, display: "boxplot" }),
        data: createMockDatasetData({
          cols: [dimension, ...metrics],
          rows: categories.flatMap((category) =>
            [1, 2, 3, 4, 100].map((value) => [
              category,
              ...metrics.map((_, index) => value * (index + 1)),
            ]),
          ),
        }),
      },
    ],
    settings,
    [],
    undefined,
    isDashboard,
  );
  const cartesianLayout = createMockChartLayout({
    outerWidth: width,
    outerHeight: 300,
    padding: { left: 50, right: 20, top: 20, bottom: 40 },
    bounds: { left: 50, right: width - 20, top: 20, bottom: 260 },
    ticksDimensions: {
      getXTickWidth: (text) => measureTextWidth(text, 12, 400),
    },
  });
  const layout = getBoxPlotLayoutModel({
    chartModel: model,
    cartesianLayout,
    settings,
    chartWidth: width,
    renderingContext,
  });
  return {
    model,
    layout,
    option: getBoxPlotOption(model, layout, settings, false, renderingContext),
  };
}

describe("dashboard box plot horizontal padding", () => {
  it.each([
    { width: 400, seriesCount: 1 },
    { width: 400, seriesCount: 2 },
    { width: 1100, seriesCount: 1 },
    { width: 1100, seriesCount: 2 },
  ])(
    "keeps boxes, points and means aligned at $width px with $seriesCount series (UXW-5182)",
    ({ width, seriesCount }) => {
      const { model, layout, option } = getScenario(width, true, seriesCount);
      expect(layout.dashboardXAxis).toBeDefined();
      expect(layout.xValueWidth).toBe(layout.dashboardXAxis?.step);
      const previousMeasureText = platformApi.measureText;
      echarts.setPlatformAPI({ measureText: measureTextEChartsAdapter });
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width,
        height: 300,
      });
      try {
        chart.setOption(option);
        expect(chart.renderToSVGString()).toContain("Revenue goal");
        const elements = chart.getZr().storage.getDisplayList(true);
        const boxes = elements.filter(
          (element) => element.type === "boxplotBoxPath",
        );
        expect(boxes).toHaveLength(categories.length * seriesCount);
        const boxBounds = boxes.map((box) => {
          const bounds = box.getBoundingRect().clone();
          if (box.transform) {
            bounds.applyTransform(box.transform);
          }
          expect(bounds.x).toBeGreaterThanOrEqual(
            layout.adjustedPadding.left - 0.001,
          );
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            width - layout.adjustedPadding.right + 0.001,
          );
          return bounds;
        });
        const centers = boxBounds
          .map((bounds) => bounds.x + bounds.width / 2)
          .sort((left, right) => left - right);
        const expectedCenters = categories
          .flatMap((_, index) =>
            model.seriesModels.map(
              (series) =>
                chart.convertToPixel({ xAxisIndex: 0 }, index) +
                (layout.visibleSeriesOffsets.get(series.dataKey) ?? 0),
            ),
          )
          .sort((left, right) => left - right);
        expect(centers.length).toBe(expectedCenters.length);
        centers.forEach((center, index) =>
          expect(center).toBeCloseTo(expectedCenters[index], 3),
        );

        const symbols = elements.filter((element) => element.type === "path");
        expect(symbols.length).toBeGreaterThan(categories.length * seriesCount);
        const symbolBounds = symbols
          .map((symbol) => {
            const bounds = symbol.getBoundingRect().clone();
            if (symbol.transform) {
              bounds.applyTransform(symbol.transform);
            }
            return bounds;
          })
          .filter((bounds) => bounds.width > 0);
        expect(symbolBounds.length).toBeGreaterThan(
          categories.length * seriesCount,
        );
        for (const bounds of symbolBounds) {
          const center = bounds.x + bounds.width / 2;
          expect(
            expectedCenters.some(
              (expected) => Math.abs(center - expected) < 0.001,
            ),
          ).toBe(true);
        }

        const labels = elements
          .filter((element) => {
            const text: unknown = element.style.text;
            return (
              element.type === "tspan" &&
              typeof text === "string" &&
              categories.includes(text)
            );
          })
          .map((label) => {
            const bounds = label.getBoundingRect().clone();
            if (label.transform) {
              bounds.applyTransform(label.transform);
            }
            return bounds;
          })
          .sort((left, right) => left.x - right.x);
        expect(labels).toHaveLength(categories.length);
        const plotWidth =
          width - layout.adjustedPadding.left - layout.adjustedPadding.right;
        const padding = getXAxisLabelPadding(plotWidth);
        labels.forEach((label, index) => {
          expect(label.x + label.width / 2).toBeCloseTo(
            chart.convertToPixel({ xAxisIndex: 0 }, index),
            3,
          );
        });
        const last = labels[labels.length - 1];
        const leftEdge = Math.min(
          labels[0].x,
          ...boxBounds.map((bounds) => bounds.x),
        );
        const rightEdge = Math.max(
          last.x + last.width,
          ...boxBounds.map((bounds) => bounds.x + bounds.width),
        );
        const leftGap = leftEdge - layout.adjustedPadding.left;
        const rightGap = width - layout.adjustedPadding.right - rightEdge;
        expect(leftGap).toBeGreaterThanOrEqual(padding - 0.501);
        expect(rightGap).toBeGreaterThanOrEqual(padding - 0.501);
        expect(Math.abs(leftGap - padding)).toBeLessThanOrEqual(0.501);
        expect(Math.abs(rightGap - padding)).toBeLessThanOrEqual(0.501);
      } finally {
        chart.dispose();
        echarts.setPlatformAPI({ measureText: previousMeasureText });
      }
    },
  );

  it("keeps full-page category layout and dataset dimensions unchanged", () => {
    const { layout, option } = getScenario(1100, false, 2);
    expect(layout.dashboardXAxis).toBeUndefined();
    expect(option.xAxis).toEqual(expect.objectContaining({ type: "category" }));
    expect(option.dataset).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimensions: expect.not.arrayContaining([X_AXIS_POSITION_KEY]),
        }),
      ]),
    );
  });
});
