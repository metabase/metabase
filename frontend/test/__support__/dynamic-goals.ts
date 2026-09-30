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
