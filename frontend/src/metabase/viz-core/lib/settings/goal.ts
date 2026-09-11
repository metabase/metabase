import { t } from "ttag";

import type { VisualizationSettings } from "metabase-types/api";

import { getDefaultGoalLabel } from "../../shared/settings/cartesian-chart";
import type { ChartGoal } from "../../shared/types/settings";
import type { VisualizationSettingsDefinitions } from "../../types";
import { getNumericGoalValue, isDynamicGoalSetting } from "../dynamic-goals";

import { getStackOffset } from "./stacking";

// Users enter a normalized goal as a percentage (50 for 50%), while the axis holds fractions.
export const getGoalAxisValue = (goalValue: number, isNormalized = false) =>
  isNormalized ? goalValue / 100 : goalValue;

/** The axis value the goal line is drawn at, or null when it is hidden or not (yet) a number. */
export const getGoalLineValue = (
  settings: VisualizationSettings,
  isNormalized = false,
): number | null => {
  const goalValue = getNumericGoalValue(settings);

  return settings["graph.show_goal"] && goalValue !== null
    ? getGoalAxisValue(goalValue, isNormalized)
    : null;
};

export const getChartGoal = (
  settings: VisualizationSettings,
): ChartGoal | null => {
  if (!settings["graph.show_goal"]) {
    return null;
  }

  // an unset goal has always drawn the line at 0
  const goalValue =
    settings["graph.goal_value"] == null ? 0 : getNumericGoalValue(settings);

  if (goalValue === null) {
    return null;
  }

  const isNormalized = getStackOffset(settings) === "expand";

  return {
    value: getGoalAxisValue(goalValue, isNormalized),
    label: settings["graph.goal_label"] ?? getDefaultGoalLabel(),
  };
};

export const GRAPH_GOAL_SETTINGS: VisualizationSettingsDefinitions = {
  "graph.show_goal": {
    getSection: () => t`Display`,
    get title() {
      return t`Goal line`;
    },
    widget: "toggle",
    getDefault: () => false,
    inline: true,
    getWrapperStyle: () => ({
      marginBottom: "1rem",
    }),
  },
  "graph.goal_value": {
    getSection: () => t`Display`,
    get title() {
      return t`Goal value`;
    },
    widget: "goalValue",
    getDefault: () => 0,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.show_goal"] !== true,
    readDependencies: ["graph.show_goal"],
    useRawSeries: true, // see getRawSeries
    getProps: ([{ card, data }]) => ({
      data,
      datasetQuery: card.dataset_query,
      isDynamic: isDynamicGoalSetting(card.display, "graph.goal_value"),
      showSelfColumns: false,
    }),
  },
  "graph.goal_label": {
    getSection: () => t`Display`,
    get title() {
      return t`Goal label`;
    },
    widget: "input",
    getDefault: getDefaultGoalLabel,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.show_goal"] !== true,
    readDependencies: ["graph.show_goal"],
  },
};
