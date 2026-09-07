import type { VisualizationDisplay } from "metabase-types/api";

export type GoalSettingKey =
  | "graph.goal_value"
  | "progress.goal"
  | "gauge.segments"
  | "scalar.segments";

export type GoalSettingKind = "value" | "segments";

// Mirrors `goal-settings` in metabase.visualization-settings.dynamic-goals
export const GOAL_SETTINGS: Record<GoalSettingKey, GoalSettingKind> = {
  "graph.goal_value": "value",
  "progress.goal": "value",
  "gauge.segments": "segments",
  "scalar.segments": "segments",
};

// A display is listed once its renderers, interactive and static, resolve the setting.
const DYNAMIC_GOAL_SETTINGS_BY_DISPLAY: Partial<
  Record<VisualizationDisplay, GoalSettingKey[]>
> = {
  gauge: ["gauge.segments"],
};

export function getDynamicGoalSettingKeys(
  display: VisualizationDisplay | undefined,
): GoalSettingKey[] {
  return display != null
    ? (DYNAMIC_GOAL_SETTINGS_BY_DISPLAY[display] ?? [])
    : [];
}
