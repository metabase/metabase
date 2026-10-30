import { CustomChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../../types";
import { GOAL_LINE_SERIES_ID, X_AXIS_DATA_KEY } from "../../constants/dataset";

import { getRowGoalLineSeriesOption } from "./goal-line";

echarts.use([CustomChart, GridComponent, SVGRenderer]);

const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const GRID_MARGIN = 50;
const X_AXIS_MAX = 100;
const GOAL_LABEL = "Target";

const goalX = (goalValue: number) =>
  GRID_MARGIN + ((CHART_WIDTH - 2 * GRID_MARGIN) * goalValue) / X_AXIS_MAX;

const PARAMS = {
  dataset: [{ [X_AXIS_DATA_KEY]: "a" }],
  isNormalized: false,
  toEChartsAxisValue: (value: unknown) => Number(value),
};

const createSettings = (
  opts: Partial<ComputedVisualizationSettings> = {},
): ComputedVisualizationSettings => ({
  "graph.show_goal": true,
  "graph.goal_value": X_AXIS_MAX / 2,
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
  settings?: Partial<ComputedVisualizationSettings>;
  renderingContext?: Partial<RenderingContext>;
}

const charts: echarts.ECharts[] = [];

const setup = ({ settings, renderingContext }: SetupOpts = {}) => {
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
    xAxis: { type: "value", min: 0, max: X_AXIS_MAX },
    yAxis: { type: "category", data: ["a", "b", "c"] },
    series: [
      getRowGoalLineSeriesOption(
        PARAMS,
        createSettings(settings),
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

describe("getRowGoalLineSeriesOption", () => {
  afterEach(() => {
    charts.splice(0).forEach((chart) => chart.dispose());
    document.body.innerHTML = "";
  });

  it("returns null when the goal is not enabled or has no value", () => {
    expect(
      getRowGoalLineSeriesOption(
        PARAMS,
        createSettings({ "graph.show_goal": false }),
        createRenderingContext(),
      ),
    ).toBeNull();
    expect(
      getRowGoalLineSeriesOption(
        PARAMS,
        createSettings({ "graph.goal_value": undefined }),
        createRenderingContext(),
      ),
    ).toBeNull();
  });

  it("triggers the goal tooltip only from the marker at the line's top end", () => {
    const { hover, onGoalHover } = setup();
    const x = goalX(X_AXIS_MAX / 2);

    hover({ zrX: x, zrY: CHART_HEIGHT / 2 });
    hover({ zrX: x, zrY: CHART_HEIGHT - GRID_MARGIN });
    expect(onGoalHover).not.toHaveBeenCalled();

    hover({ zrX: x, zrY: GRID_MARGIN });
    expect(onGoalHover).toHaveBeenCalledTimes(1);
  });

  describe("static rendering", () => {
    it("shows the label, which interactive charts replace with the marker", () => {
      const staticChart = setup({ renderingContext: { isStatic: true } });
      const interactiveChart = setup();

      expect(staticChart.getGoalLabel()).toBeDefined();
      expect(interactiveChart.getGoalLabel()).toBeUndefined();
    });

    it("flips the label left of the line when it would overflow the plot", () => {
      const renderingContext = { isStatic: true, measureText: () => 100 };
      const middle = setup({ renderingContext });
      const nearMax = setup({
        settings: { "graph.goal_value": X_AXIS_MAX * 0.9 },
        renderingContext,
      });

      expect(middle.getGoalLabel()?.getAttribute("text-anchor")).toBe("start");
      expect(nearMax.getGoalLabel()?.getAttribute("text-anchor")).toBe("end");
    });
  });
});
