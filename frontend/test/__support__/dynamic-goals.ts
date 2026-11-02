import { GOAL_LINE_DASH } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

// "CARTESIAN" here means displays rendered with `CartesianChart` component
export const DYNAMIC_GOAL_CARTESIAN_DISPLAYS = [
  "area",
  "bar",
  "combo",
  "line",
  "row",
  "scatter",
  "waterfall",
] as const satisfies readonly VisualizationDisplay[];

// Every display that resolves `graph.goal_value`
export const DYNAMIC_GOAL_DISPLAYS = [
  ...DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  "boxplot",
] as const satisfies readonly VisualizationDisplay[];

// echarts draws the line over a white halo
export const PATHS_PER_GOAL_LINE = 2;

const GOAL_LINE_SELECTOR = `path[stroke-dasharray="${GOAL_LINE_DASH.join(",")}"]`;

export function queryEChartsGoalLine() {
  return document.querySelector(GOAL_LINE_SELECTOR);
}

export function queryAllEChartsGoalLines(root: ParentNode = document) {
  return root.querySelectorAll(GOAL_LINE_SELECTOR);
}
