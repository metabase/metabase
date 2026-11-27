import { DYNAMIC_GOAL_SETTINGS_BY_DISPLAY_JSON } from "cljs/metabase.visualization_settings.dynamic_goal_settings";
import type { VisualizationDisplay } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

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

// Shared with the BE (metabase.visualization-settings.dynamic-goal-settings)
const DYNAMIC_GOAL_SETTINGS_BY_DISPLAY: unknown =
  DYNAMIC_GOAL_SETTINGS_BY_DISPLAY_JSON;

function isGoalSettingKey(key: unknown): key is GoalSettingKey {
  return typeof key === "string" && Object.hasOwn(GOAL_SETTINGS, key);
}

export function getDynamicGoalSettingKeys(
  display: VisualizationDisplay | undefined,
): GoalSettingKey[] {
  if (
    display === undefined ||
    !isObject(DYNAMIC_GOAL_SETTINGS_BY_DISPLAY) ||
    !Object.hasOwn(DYNAMIC_GOAL_SETTINGS_BY_DISPLAY, display)
  ) {
    return [];
  }
  const keys = DYNAMIC_GOAL_SETTINGS_BY_DISPLAY[display];
  return Array.isArray(keys) ? keys.filter(isGoalSettingKey) : [];
}
