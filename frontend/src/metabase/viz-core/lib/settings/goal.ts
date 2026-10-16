import { t } from "ttag";

import type {
  ColumnSettings,
  DatasetColumn,
  VisualizationSettings,
} from "metabase-types/api";

import { getFormattingOptionsWithoutScaling } from "../../echarts/cartesian/model/util";
import { getDefaultGoalLabel } from "../../shared/settings/cartesian-chart";
import type { ChartGoal } from "../../shared/types/settings";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "../../types";
import { getGoalAxisValue, getNumericGoalValue } from "../dynamic-goals";

import { getStackOffset } from "./stacking";

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
    getProps: ([{ card, data }], settings) => ({
      data,
      datasetQuery: card.dataset_query,
      formatOptions: getGoalFormatOptions(data.cols, settings),
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

// Matches the chart's goal line tooltip: y-axis formatting without the column's
// `scale` multiplier, which applies to series data but not to the goal line
function getGoalFormatOptions(
  cols: DatasetColumn[],
  settings: ComputedVisualizationSettings,
): ColumnSettings | undefined {
  const column = cols.find(
    (col) => col.name === settings["graph.metrics"]?.[0],
  );

  if (column == null) {
    return undefined;
  }

  if (settings["stackable.stack_type"] === "normalized") {
    return { column, number_style: "percent", scale: 0.01 };
  }

  return getFormattingOptionsWithoutScaling({
    column,
    ...settings.column?.(column),
  });
}
