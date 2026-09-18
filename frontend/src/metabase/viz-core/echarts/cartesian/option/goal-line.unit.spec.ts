import { CustomChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { GOAL_LINE_SERIES_ID, X_AXIS_DATA_KEY } from "../constants/dataset";

import { type GoalLineParams, getGoalLineSeriesOption } from "./goal-line";

echarts.use([CustomChart, GridComponent, SVGRenderer]);

const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const GRID_MARGIN = 50;
const Y_AXIS_MAX = 100;
const GOAL_LABEL = "Target";

// The goal sits mid-axis, so its line crosses the chart's vertical center and
// the marker sits where that line meets the right edge of the plot.
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
});
