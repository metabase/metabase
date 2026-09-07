import type { VisualizationDisplay } from "metabase-types/api";

export type GoalSettingKey =
  | "graph.goal_value"
  | "progress.goal"
  | "gauge.segments"
  | "scalar.segments";

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
