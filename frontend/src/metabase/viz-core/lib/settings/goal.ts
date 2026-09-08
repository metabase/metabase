import { t } from "ttag";

import type { VisualizationSettings } from "metabase-types/api";

import { getDefaultGoalLabel } from "../../shared/settings/cartesian-chart";
import type { ChartGoal } from "../../shared/types/settings";
import type { VisualizationSettingsDefinitions } from "../../types";
import { getNumericGoalValue, isDynamicGoalSetting } from "../dynamic-goals";

import { getStackOffset } from "./stacking";

const getGoalValue = (value: number, isPercent: boolean) =>
  isPercent ? value / 100 : value;

export const getChartGoal = (
  settings: VisualizationSettings,
): ChartGoal | null => {
  if (!settings["graph.show_goal"]) {
    return null;
  }

  const goalValue = getNumericGoalValue(settings);

  if (goalValue == null) {
    return null;
  }

  const isPercent = getStackOffset(settings) === "expand";

  return {
    value: getGoalValue(goalValue, isPercent),
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
