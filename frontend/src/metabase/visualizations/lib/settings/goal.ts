import { t } from "ttag";
import { VisualizationSettings } from "metabase-types/api";
import { ChartGoal } from "metabase/visualizations/shared/types/settings";
import { getStackOffset } from "./stacking";

const getGoalValue = (value: number, isPercent: boolean) =>
  isPercent ? value / 100 : value;

export const getChartGoal = (
  settings: VisualizationSettings,
): ChartGoal | null => {
  if (!settings["graph.show_goal"]) {
    return null;
  }
  const isPercent = getStackOffset(settings) === "expand";

  return {
    value: getGoalValue(settings["graph.goal_value"] ?? 0, isPercent),
    label: settings["graph.goal_label"] ?? t`Goal`,
  };
};
