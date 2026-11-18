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
import type { YAxisModel } from "../model/types";

import { buildAxes } from "./axis";
import { applyYAxisTicks } from "./y-axis";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const axisModel: YAxisModel = {
  seriesKeys: ["count"],
  extent: [0, 3723],
  column: createMockColumn(),
  formatter: String,
  formatGoal: String,
  splitNumber: 5,
};

function getDurationSettings(
  settings: Parameters<typeof createMockVisualizationSettings>[0] = {},
) {
  return createMockVisualizationSettings({
    "graph.y_axis.axis_enabled": true,
    "graph.y_axis.scale": "linear",
    column: () => ({ number_style: "duration" }),
    ...settings,
  });
}

type SetupOpts = {
  model?: YAxisModel;
  settings?: ReturnType<typeof createMockVisualizationSettings>;
};

function setup({
  model = axisModel,
  settings = getDurationSettings(),
}: SetupOpts = {}) {
  const chartModel = createMockCartesianChartModel({
    leftAxisModel: model,
    rightAxisModel: null,
  });
  const chartLayout = createMockChartLayout();
  const axes = buildAxes(
    chartModel,
    chartLayout,
    settings,
    false,
    renderingContext,
  );
  return applyYAxisTicks(axes.yAxis, chartModel, chartLayout, settings);
}

describe("duration Y-axis ticks", () => {
  it("steps by round duration and ends axis on one", () => {
    const yAxis = setup();
    expect(yAxis[0]).toMatchObject({ interval: 900, min: 0, max: 4500 });
  });

  it("uses fewer steps for smaller tick count", () => {
    const yAxis = setup({ model: { ...axisModel, splitNumber: 2 } });
    expect(yAxis[0]).toMatchObject({ interval: 3600, min: 0, max: 7200 });
  });

  it("reads duration unit and precision from column settings", () => {
    const yAxis = setup({
      model: { ...axisModel, extent: [0, 240_000], splitNumber: 4 },
      settings: getDurationSettings({
        column: () => ({
          number_style: "duration",
          duration_unit: "millisecond",
          duration_precision: "minute",
        }),
      }),
    });
    expect(yAxis[0]).toMatchObject({ interval: 60_000, min: 0, max: 240_000 });
  });

  it("keeps manual axis bounds", () => {
    const yAxis = setup({
      model: { ...axisModel, splitNumber: 4 },
      settings: getDurationSettings({
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 100,
        "graph.y_axis.max": 4000,
      }),
    });
    expect(yAxis[0]).toMatchObject({ interval: 1200, min: 100, max: 4000 });
  });

  it("leaves other number styles, non-linear and normalized axes to default ticks", () => {
    const decimalAxis = setup({
      settings: getDurationSettings({ column: () => ({}) }),
    });
    const logAxis = setup({
      settings: getDurationSettings({ "graph.y_axis.scale": "log" }),
    });
    const normalizedAxis = setup({
      model: { ...axisModel, isNormalized: true },
    });
    expect(decimalAxis[0]).not.toHaveProperty("interval");
    expect(logAxis[0]).not.toHaveProperty("interval");
    expect(normalizedAxis[0]).not.toHaveProperty("interval");
  });
});
