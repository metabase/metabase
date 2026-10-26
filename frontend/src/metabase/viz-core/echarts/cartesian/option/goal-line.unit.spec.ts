import { CustomChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import {
  createMockCartesianChartModel,
  createMockChartContext,
} from "__support__/echarts";
import type { GoalValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { GOAL_LINE_SERIES_ID, X_AXIS_DATA_KEY } from "../constants/dataset";

import {
  type GoalLineParams,
  getGoalLineParams,
  getGoalLineSeriesOption,
} from "./goal-line";

echarts.use([CustomChart, GridComponent, SVGRenderer]);

const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const GRID_MARGIN = 50;
const Y_AXIS_MAX = 100;
const GOAL_LABEL = "Target";

const MARKER_POSITION = {
  zrX: CHART_WIDTH - GRID_MARGIN,
  zrY: CHART_HEIGHT / 2,
};
const LINE_POSITION = { zrX: CHART_WIDTH / 2, zrY: CHART_HEIGHT / 2 };

const createParams = (opts: Partial<GoalLineParams> = {}): GoalLineParams => ({
  dataset: [{ [X_AXIS_DATA_KEY]: "a" }],
  isNormalized: false,
  toEChartsAxisValue: (value) => Number(value),
  labelOnLeft: false,
  ...opts,
});

const createSettings = (
  opts: Partial<ComputedVisualizationSettings> = {},
): ComputedVisualizationSettings => ({
  "graph.show_goal": true,
  "graph.goal_value": Y_AXIS_MAX / 2,
  "graph.goal_label": GOAL_LABEL,
  ...opts,
});

const createRenderingContext = (
  opts: Partial<RenderingContext> = {},
): RenderingContext => ({
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
  ...opts,
});

interface SetupOpts {
  params?: Partial<GoalLineParams>;
  renderingContext?: Partial<RenderingContext>;
}

const charts: echarts.ECharts[] = [];

const setup = ({ params, renderingContext }: SetupOpts = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const chart = echarts.init(container, undefined, {
    renderer: "svg",
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });
  charts.push(chart);

  chart.setOption({
    animation: false,
    grid: {
      left: GRID_MARGIN,
      right: GRID_MARGIN,
      top: GRID_MARGIN,
      bottom: GRID_MARGIN,
      outerBoundsMode: "none",
    },
    xAxis: { type: "category", data: ["a", "b", "c"] },
    yAxis: { type: "value", min: 0, max: Y_AXIS_MAX },
    series: [
      getGoalLineSeriesOption(
        createParams(params),
        createSettings(),
        createRenderingContext(renderingContext),
      ),
    ],
  });

  const onGoalHover = jest.fn();
  chart.on("mousemove", { seriesId: GOAL_LINE_SERIES_ID }, onGoalHover);

  const hover = (position: { zrX: number; zrY: number }) =>
    chart.getZr().handler.dispatch("mousemove", position);

  const getGoalLabel = () =>
    Array.from(container.querySelectorAll("text")).find(
      (text) => text.textContent === GOAL_LABEL,
    );

  return { onGoalHover, hover, getGoalLabel };
};

const renderingContext = createMockChartContext();

describe("getGoalLineSeriesOption", () => {
  afterEach(() => {
    charts.splice(0).forEach((chart) => chart.dispose());
    document.body.innerHTML = "";
  });

  it("returns null when the goal is not enabled", () => {
    const option = getGoalLineSeriesOption(
      createParams(),
      createSettings({ "graph.show_goal": false }),
      createRenderingContext(),
    );

    expect(option).toBeNull();
  });

  it("returns null when the goal has no value", () => {
    const option = getGoalLineSeriesOption(
      createParams(),
      createSettings({ "graph.goal_value": undefined }),
      createRenderingContext(),
    );

    expect(option).toBeNull();
  });

  it("triggers the goal tooltip hover only from the bullseye marker", () => {
    const { hover, onGoalHover } = setup();

    hover(LINE_POSITION);
    expect(onGoalHover).not.toHaveBeenCalled();

    hover(MARKER_POSITION);
    expect(onGoalHover).toHaveBeenCalledTimes(1);
  });

  describe("static rendering", () => {
    it("shows the inline label, which interactive charts replace with the marker", () => {
      const staticChart = setup({ renderingContext: { isStatic: true } });
      const interactiveChart = setup();

      expect(staticChart.getGoalLabel()).toBeDefined();
      expect(interactiveChart.getGoalLabel()).toBeUndefined();
    });

    it("moves the label to the left when a right axis is present", () => {
      const { getGoalLabel } = setup({
        params: { labelOnLeft: true },
        renderingContext: { isStatic: true },
      });

      expect(getGoalLabel()?.getAttribute("text-anchor")).toBe("start");
    });
  });

  it("draws the goal line at a static value", () => {
    expect(getGoalLineData(250)).toEqual([["foo", 250]]);
  });

  it("reads a normalized stack goal as a percentage", () => {
    expect(getGoalLineData(50, { isNormalized: true })).toEqual([["foo", 0.5]]);
  });

  it("draws nothing for an unresolved reference", () => {
    expect(
      getGoalLineData({ type: "card", id: 9, column: "goal" }),
    ).toBeUndefined();
    expect(getGoalLineData("count")).toBeUndefined();
  });

  it("draws nothing for an empty goal", () => {
    expect(getGoalLineData(null)).toBeUndefined();
  });
});

function getGoalLineData(
  goalValue: GoalValue | null,
  { isNormalized = false }: { isNormalized?: boolean } = {},
) {
  const chartModel = createMockCartesianChartModel({
    dataset: [{ [X_AXIS_DATA_KEY]: "foo", count: 1 }],
    leftAxisModel: isNormalized
      ? {
          seriesKeys: ["count"],
          extent: [0, 1],
          column: createMockColumn({ name: "count" }),
          formatter: String,
          formatGoal: String,
          splitNumber: 5,
          isNormalized,
        }
      : null,
  });
  const settings = createMockVisualizationSettings({
    "graph.show_goal": true,
    "graph.goal_value": goalValue,
  });

  return getGoalLineSeriesOption(
    getGoalLineParams(chartModel),
    settings,
    renderingContext,
  )?.data;
}
