import { GOAL_LINE_DASH } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

// "CARTESIAN" here means displays rendered with `CartesianChart` component
export const DYNAMIC_GOAL_CARTESIAN_DISPLAYS = [
  "area",
  "bar",
  "combo",
  "line",
  "scatter",
  "waterfall",
] as const satisfies readonly VisualizationDisplay[];

// Every display that resolves `graph.goal_value`
export const DYNAMIC_GOAL_DISPLAYS = [
  ...DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  "boxplot",
  "row",
] as const satisfies readonly VisualizationDisplay[];

export function queryEChartsGoalLine() {
  // Interactive goal lines show a marker instead of their label
  return document.querySelector(
    `path[stroke-dasharray="${GOAL_LINE_DASH.join(",")}"]`,
  );
}
