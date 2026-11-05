import { ScatterChart } from "echarts/charts";
import {
  BrushComponent,
  GridComponent,
  ToolboxComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type { RenderingContext } from "../../../../types";
import { getChartLayout } from "../../layout";
import { getScatterPlotModel } from "../model";

import { getScatterPlotOption } from "./index";

echarts.use([
  ScatterChart,
  GridComponent,
  BrushComponent,
  ToolboxComponent,
  SVGRenderer,
]);

const renderingContext: RenderingContext = {
  getColor: () => "#509EE3",
  measureText: (text) => text.length * 8,
  measureTextHeight: () => 12,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const rawSeries: RawSeries = [
  {
    card: createMockCard({ id: 1, display: "scatter" }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "x", base_type: "type/Integer" }),
        createMockColumn({ name: "y", base_type: "type/Integer" }),
      ],
      rows: [
        [1, 10],
        [2, 20],
        [3, 30],
      ],
    }),
  },
];

const settings = createMockVisualizationSettings({
  "graph.dimensions": ["x"],
  "graph.metrics": ["y"],
});

describe("getScatterPlotOption", () => {
  it("renders without a lone x-axis and does not crash echarts when there are no series", () => {
    const chartModel = getScatterPlotModel(
      rawSeries,
      settings,
      ["1:y"],
      renderingContext,
    );
    const chartLayout = getChartLayout(
      chartModel,
      settings,
      false,
      480,
      360,
      renderingContext,
    );

    const option = getScatterPlotOption(
      chartModel,
      chartLayout,
      false,
      null,
      [],
      settings,
      480,
      false,
      renderingContext,
    );

    expect(option.xAxis).toEqual([]);
    expect(option.yAxis).toEqual([]);

    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const chart = echarts.init(dom, undefined, {
      renderer: "svg",
      width: 600,
      height: 400,
    });
    expect(() => chart.setOption(option)).not.toThrow();
    chart.dispose();
  });
});
