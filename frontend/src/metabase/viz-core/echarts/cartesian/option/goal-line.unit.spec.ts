import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import type { ChartDataset } from "../model/types";

import {
  GOAL_LINE_DASH,
  type GoalLineParams,
  getGoalLineSeriesOption,
} from "./goal-line";

const PLOT_X = 40;
const PLOT_WIDTH = 200;
const PLOT_X_END = PLOT_X + PLOT_WIDTH;
const GOAL_Y = 75;

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

const dataset: ChartDataset = [{ [X_AXIS_DATA_KEY]: "2025-01-01" }];

const createParams = (opts: Partial<GoalLineParams> = {}): GoalLineParams => ({
  dataset,
  isNormalized: false,
  toEChartsAxisValue: (value) => Number(value),
  labelOnLeft: false,
  ...opts,
});

const createSettings = (
  opts: Partial<ComputedVisualizationSettings> = {},
): ComputedVisualizationSettings => ({
  "graph.show_goal": true,
  "graph.goal_value": 25000,
  "graph.goal_label": "Goal",
  ...opts,
});

type RenderedChild = {
  type: string;
  x?: number;
  y?: number;
  shape?: Record<string, number>;
  style?: Record<string, unknown>;
  silent?: boolean;
};

const getGoalLineChildren = (
  params: GoalLineParams,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): RenderedChild[] => {
  const option = getGoalLineSeriesOption(params, settings, renderingContext);

  if (option == null || typeof option.renderItem !== "function") {
    return [];
  }

  // ECharts types renderItem's arguments as large internal interfaces. This
  // series only reads coordSys and coord, so stubs are cast rather than fully
  // reconstructed.
  const itemParams = { coordSys: { x: PLOT_X, width: PLOT_WIDTH } } as never;
  // See above.
  const itemApi = { coord: () => [PLOT_X, GOAL_Y] } as never;

  // ECharts returns a loose renderItem payload; this series always builds a
  // group of shape children.
  const rendered = option.renderItem(itemParams, itemApi) as
    | { children?: RenderedChild[] }
    | undefined;

  return rendered?.children ?? [];
};

describe("getGoalLineSeriesOption", () => {
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

  it("draws the goal line as a thin dotted line spanning the plot area", () => {
    const children = getGoalLineChildren(
      createParams(),
      createSettings(),
      createRenderingContext(),
    );
    const line = children.find((child) => child.type === "line");

    expect(line?.shape).toEqual({
      x1: PLOT_X,
      x2: PLOT_X_END,
      y1: GOAL_Y,
      y2: GOAL_Y,
    });
    expect(line?.style?.lineWidth).toBe(1);
    expect(line?.style?.lineDash).toEqual(GOAL_LINE_DASH);
  });

  describe("interactive rendering", () => {
    it("renders the bullseye marker instead of an inline label", () => {
      const children = getGoalLineChildren(
        createParams(),
        createSettings(),
        createRenderingContext(),
      );

      expect(children.some((child) => child.type === "text")).toBe(false);

      const circles = children.filter((child) => child.type === "circle");
      const { outerRingRadius, innerRingRadius, ringWidth, hitAreaRadius } =
        CHART_STYLE.goalLine.marker;

      expect(circles.map((circle) => circle.shape?.r)).toEqual([
        outerRingRadius,
        innerRingRadius,
        hitAreaRadius,
      ]);
      expect(circles[0].style?.lineWidth).toBe(ringWidth);
      expect(circles[0].style?.stroke).toBe("text-primary");
    });

    it("positions the marker at the right edge of the plot area", () => {
      const children = getGoalLineChildren(
        createParams(),
        createSettings(),
        createRenderingContext(),
      );
      const circles = children.filter((child) => child.type === "circle");

      circles.forEach((circle) => {
        expect(circle.shape?.cx).toBe(PLOT_X_END);
        expect(circle.shape?.cy).toBe(GOAL_Y);
      });
    });

    it("keeps the marker on the right edge when a right axis is present", () => {
      const children = getGoalLineChildren(
        createParams({ labelOnLeft: true }),
        createSettings(),
        createRenderingContext(),
      );
      const circles = children.filter((child) => child.type === "circle");

      expect(circles).not.toHaveLength(0);
      circles.forEach((circle) => {
        expect(circle.shape?.cx).toBe(PLOT_X_END);
      });
    });

    it("leaves the hit area as the only hoverable element in the series", () => {
      const children = getGoalLineChildren(
        createParams(),
        createSettings(),
        createRenderingContext(),
      );
      const hoverable = children.filter((child) => child.silent !== true);

      expect(hoverable).toHaveLength(1);
      expect(hoverable[0].shape?.r).toBe(
        CHART_STYLE.goalLine.marker.hitAreaRadius,
      );
    });

    it("keeps the hit area invisible with a hit-testable fill", () => {
      const children = getGoalLineChildren(
        createParams(),
        createSettings(),
        createRenderingContext(),
      );
      const hitArea = children.find(
        (child) => child.shape?.r === CHART_STYLE.goalLine.marker.hitAreaRadius,
      );

      // "none"/"transparent" fills are skipped for pointer events, so the hit
      // area needs a real fill hidden by zero opacity.
      expect(hitArea?.style?.fill).toBe("text-primary");
      expect(hitArea?.style?.opacity).toBe(0);
    });
  });

  describe("static rendering", () => {
    it("keeps the inline label so the goal stays readable without hover", () => {
      const children = getGoalLineChildren(
        createParams(),
        createSettings(),
        createRenderingContext({ isStatic: true }),
      );

      expect(children.some((child) => child.type === "circle")).toBe(false);

      const label = children.find((child) => child.type === "text");
      expect(label?.style?.text).toBe("Goal");
      expect(label?.style?.align).toBe("right");
      expect(label?.x).toBe(PLOT_X_END);
    });

    it("moves the label to the left when a right axis is present", () => {
      const children = getGoalLineChildren(
        createParams({ labelOnLeft: true }),
        createSettings(),
        createRenderingContext({ isStatic: true }),
      );
      const label = children.find((child) => child.type === "text");

      expect(label?.style?.align).toBe("left");
      expect(label?.x).toBe(PLOT_X);
    });
  });
});
