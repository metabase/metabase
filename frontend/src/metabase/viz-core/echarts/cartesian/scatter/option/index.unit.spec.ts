import { ScatterChart } from "echarts/charts";
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
import { color } from "metabase/ui/colors";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../../types";
import { X_AXIS_DATA_KEY, X_AXIS_POSITION_KEY } from "../../constants/dataset";
import { getChartLayout } from "../../layout";
import {
  getXAxisLabelPadding,
  getXAxisWidth,
} from "../../option/x-axis-padding";
import { getScatterPlotModel } from "../model";

import { getScatterPlotOption } from ".";

echarts.use([
  ScatterChart,
  BrushComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  ToolboxComponent,
  SVGRenderer,
]);

const renderingContext: RenderingContext = {
  getColor: color,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_text, style) => Number(style.size),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const setup = (
  isDashboard: boolean,
  {
    width = 400,
    hasBubbleSize = false,
    xAxisScale = "ordinal",
    compactAxis = false,
    rows = [
      ["A", 10],
      ["B", 20],
      ["A", 30],
    ],
  }: {
    width?: number;
    hasBubbleSize?: boolean;
    xAxisScale?: ComputedVisualizationSettings["graph.x_axis.scale"];
    compactAxis?: boolean;
    rows?: RowValue[][];
  } = {},
) => {
  const dimensionColumn = createMockColumn({
    name: "category",
    base_type: "type/Text",
  });
  if (xAxisScale === "timeseries") {
    dimensionColumn.base_type = "type/DateTime";
    dimensionColumn.unit = "month";
  } else if (xAxisScale !== "ordinal") {
    dimensionColumn.base_type = "type/Float";
  }
  const settings = createMockVisualizationSettings({
    "graph.dimensions": ["category"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": xAxisScale,
    "graph.x_axis.axis_enabled": compactAxis ? "compact" : true,
    "graph.y_axis.scale": "linear",
    "graph.y_axis.axis_enabled": true,
    "graph.y_axis.auto_range": true,
    "scatter.bubble": hasBubbleSize ? "size" : undefined,
    column: (column: DatasetColumn) => ({ column }),
    series: () => ({ display: "scatter" }),
  });
  const model = getScatterPlotModel(
    [
      {
        card: createMockCard({ id: 1, display: "scatter" }),
        data: createMockDatasetData({
          cols: [
            dimensionColumn,
            createMockColumn({ name: "count", base_type: "type/Integer" }),
            ...(hasBubbleSize
              ? [createMockColumn({ name: "size", base_type: "type/Integer" })]
              : []),
          ],
          rows,
        }),
      },
    ],
    settings,
    [],
    renderingContext,
    undefined,
    isDashboard ? { width: 8, height: 6 } : undefined,
  );
  const layout = getChartLayout(
    model,
    settings,
    false,
    width,
    300,
    renderingContext,
  );
  const option = getScatterPlotOption(
    model,
    layout,
    false,
    null,
    [],
    settings,
    width,
    false,
    renderingContext,
  );

  return { model, layout, option };
};

type ChartDisplayable = ReturnType<
  ReturnType<echarts.EChartsType["getZr"]>["storage"]["getDisplayList"]
>[number];

function getBounds(element: ChartDisplayable) {
  const rectangle = element.getBoundingRect().clone();
  if (element.transform) {
    rectangle.applyTransform(element.transform);
  }
  return rectangle;
}

const previousMeasureText = platformApi.measureText;
beforeEach(() =>
  echarts.setPlatformAPI({ measureText: measureTextEChartsAdapter }),
);
afterEach(() => echarts.setPlatformAPI({ measureText: previousMeasureText }));

function renderScatter(
  isDashboard: boolean,
  options: Parameters<typeof setup>[1],
) {
  const result = setup(isDashboard, options);
  const width = options?.width ?? 400;
  const { model, layout, option } = result;
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width,
    height: 300,
  });
  try {
    chart.setOption(option);
    chart.renderToSVGString();
    const elements = chart.getZr().storage.getDisplayList(true);
    const labels = elements.flatMap((element) => {
      const text: unknown = element.style.text;
      const bounds = getBounds(element);
      if (
        element.type !== "tspan" ||
        typeof text !== "string" ||
        bounds.x < layout.padding.left ||
        bounds.y < layout.bounds.bottom
      ) {
        return [];
      }
      return [{ text: text.trim(), bounds }];
    });
    const bubbles = elements
      .filter((element) => element.type === "path")
      .map(getBounds);
    const positions = model.transformedDataset.flatMap((datum) => {
      const value = datum[X_AXIS_DATA_KEY];
      if (typeof value !== "number" && typeof value !== "string") {
        return [];
      }
      return [
        (chart.convertToPixel({ xAxisIndex: 0 }, value) - layout.padding.left) /
          getXAxisWidth(layout),
      ];
    });
    return { ...result, labels, bubbles, positions };
  } finally {
    chart.dispose();
  }
}

const numericRows = (firstBubbleSize = 0): RowValue[][] => [
  [20.96, 1, firstBubbleSize],
  [3000.01, 40, 10],
  [15000.03, 120, 100],
  [43186.48, 280, 0],
];

describe("scatter X-axis padding", () => {
  it.each([280, 600, 1000])(
    "preserves native numeric ticks and bubble positions at width %s",
    (width) => {
      const options = {
        width,
        rows: numericRows(100),
        xAxisScale: "linear" as const,
        hasBubbleSize: true,
      };
      const { labels, layout, positions } = renderScatter(true, options);
      const { labels: questionLabels } = renderScatter(false, options);
      expect(layout.dashboardXAxis).toBeUndefined();
      expect(labels.map(({ text }) => text)).toEqual(
        questionLabels.map(({ text }) => text),
      );
      expect(positions[0]).toBeCloseTo(20.96 / 50000, 6);
      expect(positions[3]).toBeCloseTo(43186.48 / 50000, 6);
    },
  );

  it.each([600, 1000])(
    "measures padding from the zero label while bubbles extend before it at width %s",
    (width) => {
      const { labels, bubbles, layout } = renderScatter(true, {
        width,
        rows: numericRows(100),
        xAxisScale: "linear",
        hasBubbleSize: true,
      });
      expect(labels[0].text).toBe("0");
      expect(labels[labels.length - 1].text).toBe("50,000");
      expect(labels[0].bounds.x - layout.padding.left).toBeCloseTo(
        getXAxisLabelPadding(getXAxisWidth(layout)),
        3,
      );
      expect(bubbles).toHaveLength(4);
      expect(bubbles[0].x + bubbles[0].width / 2).toBeLessThan(
        labels[0].bounds.x,
      );
    },
  );

  it.each([
    { scale: "linear", values: [20.96, 3000.01, 15000.03, 43186.48] },
    { scale: "ordinal", values: ["A", "B", "C", "D"] },
    {
      scale: "timeseries",
      values: ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01"],
    },
    { scale: "log", values: [1, 10, 100, 1000] },
    { scale: "pow", values: [1, 10, 100, 1000] },
  ] as const)(
    "retains native $scale ticks and positions in dashboard cards",
    ({ scale, values }) => {
      const options = {
        width: 1000,
        rows: values.map((value, index) => [
          value,
          10 + index * 10,
          index * 30,
        ]),
        xAxisScale: scale,
        hasBubbleSize: true,
      };
      const { labels: questionLabels, positions: questionPositions } =
        renderScatter(false, options);
      const { labels, positions, layout } = renderScatter(true, options);
      expect(layout.dashboardXAxis).toBeUndefined();
      expect(labels.map(({ text }) => text)).toEqual(
        questionLabels.map(({ text }) => text),
      );
      expect(positions).toHaveLength(values.length);
      for (let index = 0; index < values.length; index++) {
        expect(positions[index]).toBeCloseTo(questionPositions[index], 6);
      }
    },
  );

  it("retains rounded numeric ticks (UXW-5182)", () => {
    const { labels } = renderScatter(true, {
      width: 1000,
      rows: numericRows(),
      xAxisScale: "linear",
      hasBubbleSize: true,
    });
    expect(labels.map(({ text }) => text)).toEqual([
      "0",
      "10,000",
      "20,000",
      "30,000",
      "40,000",
      "50,000",
    ]);
  });

  it.each(["linear", "ordinal", "timeseries"] as const)(
    "ignores bubble size when positioning %s ticks and points",
    (scale) => {
      const values = {
        linear: [20.96, 3000.01, 15000.03, 43186.48],
        ordinal: ["A", "B", "C", "D"],
        timeseries: ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01"],
      }[scale];
      const charts = [0, 100].map((firstSize) =>
        renderScatter(true, {
          width: 1000,
          xAxisScale: scale,
          hasBubbleSize: true,
          rows: values.map((value, index) => [
            value,
            10 + index * 10,
            index === 0 ? firstSize : 100,
          ]),
        }),
      );
      expect(charts[0].positions).toEqual(charts[1].positions);
      expect(charts[0].labels).toEqual(charts[1].labels);
      expect(charts[0].bubbles[0].width).toBeLessThan(
        charts[1].bubbles[0].width,
      );
    },
  );

  it.each([false, true])(
    "uses native category encoding when isDashboard=%s",
    (isDashboard) => {
      const { model, layout, option } = setup(isDashboard);
      expect(layout.dashboardXAxis).toBeUndefined();
      expect(option.xAxis).toMatchObject({ type: "category" });
      expect(option.series).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "scatter",
            encode: { x: X_AXIS_DATA_KEY, y: model.seriesModels[0].dataKey },
            symbolSize: 15,
          }),
        ]),
      );
      expect(option.dataset).toEqual([
        expect.objectContaining({
          dimensions: expect.not.arrayContaining([X_AXIS_POSITION_KEY]),
          source: model.transformedDataset,
        }),
      ]);
      expect(
        model.transformedDataset.map((datum) => datum[X_AXIS_DATA_KEY]),
      ).toEqual(["A", "B", "A"]);
    },
  );
});
