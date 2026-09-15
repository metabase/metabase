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
import type { RenderingContext } from "../../../../types";
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
    compactAxis = false,
    rows = [
      ["A", 10],
      ["B", 20],
      ["A", 30],
    ],
  }: {
    width?: number;
    hasBubbleSize?: boolean;
    compactAxis?: boolean;
    rows?: RowValue[][];
  } = {},
) => {
  const settings = createMockVisualizationSettings({
    "graph.dimensions": ["category"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": "ordinal",
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
            createMockColumn({ name: "category", base_type: "type/Text" }),
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

describe("scatter X-axis encoding", () => {
  it("uses category positions for dashboard points and retains source categories", () => {
    const { model, layout, option } = setup(true);

    expect(layout.dashboardXAxis).toBeDefined();
    expect(option.xAxis).toMatchObject({ type: "value" });
    expect(option.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "scatter",
          encode: { x: X_AXIS_POSITION_KEY, y: model.seriesModels[0].dataKey },
          symbolSize: 15,
        }),
      ]),
    );
    expect(option.dataset).toEqual([
      expect.objectContaining({
        dimensions: expect.arrayContaining([
          X_AXIS_DATA_KEY,
          X_AXIS_POSITION_KEY,
        ]),
        source: model.transformedDataset,
      }),
    ]);
    expect(
      model.transformedDataset.map((datum) => datum[X_AXIS_DATA_KEY]),
    ).toEqual(["A", "B", "A"]);
  });

  it("keeps native category encoding outside dashboards", () => {
    const { model, layout, option } = setup(false);

    expect(layout.dashboardXAxis).toBeUndefined();
    expect(option.xAxis).toMatchObject({ type: "category" });
    expect(option.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "scatter",
          encode: { x: X_AXIS_DATA_KEY, y: model.seriesModels[0].dataKey },
        }),
      ]),
    );
  });

  it.each([
    { name: "an endpoint", largeBubbleIndex: 0 },
    { name: "the middle", largeBubbleIndex: 5 },
  ])(
    "centers unequal endpoint labels over dense bubbles with the largest bubble at $name",
    ({ largeBubbleIndex }) => {
      const values = [
        "A",
        ...Array.from({ length: 10 }, (_, index) => `K${index}`),
        "Long endpoint label",
      ];
      const rows = values.map((value, index) => [
        value,
        30 + index * 3,
        index === largeBubbleIndex ? 100 : 0,
      ]);
      const width = 700;
      const { model, layout, option } = setup(true, {
        width,
        hasBubbleSize: true,
        compactAxis: true,
        rows,
      });
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
        const symbols = elements
          .filter((element) => element.type === "path")
          .map(getBounds);
        const labelBounds = (text: string) =>
          elements
            .filter((element) => {
              const value: unknown = element.style.text;
              return (
                element.type === "tspan" &&
                typeof value === "string" &&
                value.trim() === text
              );
            })
            .map(getBounds)[0];
        const firstLabel = labelBounds(values[0]);
        const lastLabel = labelBounds(values[values.length - 1]);
        const firstSymbol = symbols[0];
        const lastSymbol = symbols[symbols.length - 1];

        expect(layout.dashboardXAxis).toBeDefined();
        expect(symbols).toHaveLength(values.length);
        expect(firstLabel).toBeDefined();
        expect(lastLabel).toBeDefined();
        if (!firstLabel || !lastLabel || !firstSymbol || !lastSymbol) {
          return;
        }

        expect(firstLabel.x + firstLabel.width / 2).toBeCloseTo(
          firstSymbol.x + firstSymbol.width / 2,
          4,
        );
        expect(lastLabel.x + lastLabel.width / 2).toBeCloseTo(
          lastSymbol.x + lastSymbol.width / 2,
          4,
        );
        const padding = getXAxisLabelPadding(getXAxisWidth(layout));
        expect(firstSymbol.x - layout.padding.left).toBeCloseTo(
          padding - 0.5,
          4,
        );
        expect(
          width - layout.padding.right - lastLabel.x - lastLabel.width,
        ).toBeCloseTo(padding, 4);
        expect(model.xAxisModel.endMarkWidths?.first).toBeCloseTo(
          largeBubbleIndex === 0 ? 75 : 15,
        );
        expect(model.xAxisModel.endMarkWidths?.last).toBeCloseTo(15);
      } finally {
        chart.dispose();
      }
    },
  );
});
