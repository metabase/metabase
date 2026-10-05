import {
  createMockCartesianChartModel,
  createMockChartLayout,
} from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import type { YAxisModel } from "../model/types";

import { buildAxes, createAxisVisibilityOption } from "./axis";
import { applyResponsiveYAxisTicks } from "./responsive-axis";

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
  hasResponsiveTicks: true,
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
    yAxis: applyResponsiveYAxisTicks(
      axes.yAxis,
      chartModel,
      chartLayout,
      settings,
    ),
  };
}

describe("responsive Y-axis ticks", () => {
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

  it("preserves native tick density on large charts", () => {
    const { yAxis } = setup({
      model: { ...axisModel, hasResponsiveTicks: false },
    });
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
              style: "solid",
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

describe("first x-axis label", () => {
  const settings = createMockVisualizationSettings({
    "graph.x_axis.axis_enabled": true,
  });
  const chartLayout = createMockChartLayout({ outerWidth: 300 });
  const xAxisFor = (
    chartModel: ReturnType<typeof createMockCartesianChartModel>,
    chartSettings = settings,
  ) =>
    buildAxes(chartModel, chartLayout, chartSettings, false, renderingContext)
      .xAxis;

  it("keeps the first category label when it collides with the second", () => {
    const xAxis = xAxisFor(
      createMockCartesianChartModel({
        xAxisModel: {
          axisType: "category",
          isHistogram: false,
          valuesCount: 4,
          formatter: String,
        },
      }),
    );

    expect(xAxis.axisLabel?.showMinLabel).toBe(true);
  });

  it("keeps the first time-series and numeric labels too", () => {
    const timeAxis = xAxisFor(
      createMockCartesianChartModel({
        xAxisModel: {
          axisType: "time",
          interval: { unit: "month", count: 1 },
          intervalsCount: 12,
          range: [dayjs.utc("2025-01-01"), dayjs.utc("2026-01-01")],
          formatter: String,
          toEChartsAxisValue: (value) => String(value),
          fromEChartsAxisValue: (value) => dayjs.utc(value),
        },
      }),
    );
    const numericAxis = xAxisFor(
      createMockCartesianChartModel({
        xAxisModel: {
          axisType: "value",
          extent: [0, 10],
          interval: 1,
          intervalsCount: 10,
          isPadded: true,
          formatter: String,
          toEChartsAxisValue: (value) => Number(value),
          fromEChartsAxisValue: (value) => value,
        },
      }),
    );

    expect(timeAxis.axisLabel?.showMinLabel).toBe(true);
    expect(numericAxis.axisLabel?.showMinLabel).toBe(true);
  });

  it("still labels histogram bins by their right edge", () => {
    const xAxis = xAxisFor(
      createMockCartesianChartModel({
        xAxisModel: {
          axisType: "category",
          isHistogram: true,
          valuesCount: 4,
          formatter: String,
        },
      }),
      createMockVisualizationSettings({
        "graph.x_axis.axis_enabled": true,
        "graph.x_axis.scale": "histogram",
      }),
    );

    expect(xAxis.axisLabel?.showMinLabel).toBe(false);
    expect(xAxis.axisLabel?.showMaxLabel).toBe(true);
  });
});
