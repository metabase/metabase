import {
  createMockCartesianChartModel,
  createMockChartLayout,
} from "__support__/echarts";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import type { YAxisModel } from "../model/types";

import { buildAxes, createAxisVisibilityOption } from "./axis";
import { applyDashboardYAxisTicks } from "./dashboard-axis";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const axisModel: YAxisModel = {
  seriesKeys: ["count"],
  extent: [0, 100],
  column: createMockColumn(),
  formatter: String,
  formatGoal: String,
  splitNumber: 5,
  isDashboard: true,
};

function setup({
  height = 199,
  model = axisModel,
  settings = createMockVisualizationSettings({
    "graph.y_axis.axis_enabled": true,
  }),
  rightAxisModel = null,
  chartModelOptions = {},
  panelHeight,
}: {
  height?: number;
  model?: YAxisModel;
  settings?: ReturnType<typeof createMockVisualizationSettings>;
  rightAxisModel?: YAxisModel | null;
  chartModelOptions?: Parameters<typeof createMockCartesianChartModel>[0];
  panelHeight?: number;
} = {}) {
  const chartModel = createMockCartesianChartModel({
    leftAxisModel: model,
    rightAxisModel,
    ...chartModelOptions,
  });
  const chartLayout = createMockChartLayout({
    outerHeight: height + 40,
    padding: { top: 10, bottom: 30 },
    panelHeight,
  });
  const axes = buildAxes(
    chartModel,
    chartLayout,
    settings,
    false,
    renderingContext,
  );
  return {
    ...axes,
    yAxis: applyDashboardYAxisTicks(
      axes.yAxis,
      chartModel,
      chartLayout,
      settings,
    ),
  };
}

describe("dashboard Y-axis ticks", () => {
  it.each([
    { height: 199, labels: [0, 100], gridlines: [0, 50, 100] },
    { height: 200, labels: [0, 50, 100], gridlines: [0, 50, 100] },
    { height: 299, labels: [0, 50, 100], gridlines: [0, 50, 100] },
    { height: 300, labels: [0, 50, 100], gridlines: [0, 25, 50, 75, 100] },
    { height: 399, labels: [0, 50, 100], gridlines: [0, 25, 50, 75, 100] },
    {
      height: 400,
      labels: [0, 25, 50, 75, 100],
      gridlines: [0, 25, 50, 75, 100],
    },
  ])(
    "uses the tick density for a $height px plot",
    ({ height, labels, gridlines }) => {
      const { yAxis } = setup({ height });
      expect(yAxis[0]).toMatchObject({
        axisLabel: { customValues: labels },
        axisTick: { customValues: gridlines },
      });
    },
  );

  it("preserves an explicit tick count on small cards", () => {
    const { yAxis } = setup({
      model: { ...axisModel, splitNumber: 7 },
      settings: createMockVisualizationSettings({
        "graph.y_axis.split_number": 7,
      }),
    });
    expect(yAxis[0]).toMatchObject({ splitNumber: 7 });
    expect(yAxis[0].axisTick?.customValues).toBeUndefined();
  });

  it("preserves question tick density", () => {
    const { yAxis } = setup({ model: { ...axisModel, isDashboard: false } });
    expect(yAxis[0]).toMatchObject({ splitNumber: 5 });
    expect(yAxis[0].axisTick?.customValues).toBeUndefined();
  });

  it("preserves default gridline styling when the Y-axis is disabled", () => {
    const { yAxis } = setup({
      settings: createMockVisualizationSettings({
        "graph.y_axis.axis_enabled": false,
      }),
    });
    expect(yAxis[0].splitLine).toBeUndefined();
  });

  it("does not draw the right-axis intermediate gridlines over the left axis", () => {
    const { yAxis } = setup({ rightAxisModel: axisModel });
    expect(yAxis[0].splitLine?.lineStyle?.opacity).toBe(1);
    expect(yAxis[1].splitLine?.lineStyle?.opacity).toBe(0);
  });

  it("toggles both major and intermediate gridlines on hover", () => {
    expect(
      createAxisVisibilityOption({ show: true, splitLineVisible: false }),
    ).toMatchObject({
      splitLine: { lineStyle: { opacity: 0 } },
    });
  });

  it("includes a goal outside the data range without changing the other axis", () => {
    const { yAxis } = setup({
      rightAxisModel: axisModel,
      settings: createMockVisualizationSettings({
        "graph.y_axis.axis_enabled": true,
        "graph.y_axis.auto_range": true,
        "graph.show_goal": true,
        "graph.goal_value": 400,
      }),
    });
    expect(yAxis[0].axisLabel?.customValues).toEqual([0, 400]);
    expect(yAxis[1].axisLabel?.customValues).toEqual([0, 100]);
  });

  it("includes the trend line extent on its matching axis", () => {
    const { yAxis } = setup({
      chartModelOptions: {
        trendLinesModel: {
          extents: { trend: [400, 400] },
          dataset: [{ [X_AXIS_DATA_KEY]: 1, trend: 400 }],
          seriesModels: [
            {
              sourceDataKey: "count",
              dataKey: "trend",
              name: "Trend",
              color: "brand",
              visible: true,
              column: axisModel.column,
              columnIndex: 1,
            },
          ],
        },
      },
    });
    expect(yAxis[0].axisLabel?.customValues).toEqual([0, 400]);
  });

  it("uses the individual panel height for split charts", () => {
    const { yAxis } = setup({
      height: 800,
      panelHeight: 199,
      chartModelOptions: { splitPanelYAxisModels: [axisModel] },
    });
    expect(yAxis[0].axisLabel?.customValues).toEqual([0, 100]);
  });
});
