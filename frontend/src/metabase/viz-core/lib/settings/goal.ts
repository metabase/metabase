import { t } from "ttag";

import type { VisualizationSettings } from "metabase-types/api";
import { isGoalStaticValue } from "metabase-types/guards";

import { getDefaultGoalLabel } from "../../shared/settings/cartesian-chart";
import type { ChartGoal } from "../../shared/types/settings";
import type { VisualizationSettingsDefinitions } from "../../types";
import { isDynamicGoalSetting } from "../dynamic-goals";

import { getStackOffset } from "./stacking";

const getGoalValue = (value: number, isPercent: boolean) =>
  isPercent ? value / 100 : value;

// Renderers only see numbers here: the chart boundary resolves references first.
// A reference that got past it means resolution was skipped, so it counts as "no goal".
export const getNumericGoalValue = (
  settings: VisualizationSettings,
): number | null => {
  const value = settings["graph.goal_value"];
  return isGoalStaticValue(value) ? value : null;
};

export const getUnresolvedGoalMessage = () =>
  t`Couldn't load the value this chart's goal line depends on.`;

export const getChartGoal = (
  settings: VisualizationSettings,
): ChartGoal | null => {
  const goalValue = getNumericGoalValue(settings);

  if (!settings["graph.show_goal"] || goalValue == null) {
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
    // the transformed series drop `data.referenced_entities`
    useRawSeries: true,
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
