import { t } from "ttag";

import type { ColumnSettings, DatasetColumn } from "metabase-types/api";

import { getFormattingOptionsWithoutScaling } from "../../echarts/cartesian/model/util";
import { getDefaultGoalLabel } from "../../shared/settings/cartesian-chart";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "../../types";

export const GRAPH_GOAL_SETTINGS: VisualizationSettingsDefinitions = {
  "graph.show_goal": {
    getSection: getGraphGoalSettingsSection,
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
    getSection: getGraphGoalSettingsSection,
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
      display: card.display,
      formatOptions: getGoalFormatOptions(data.cols, settings),
      showSelfColumns: false,
    }),
  },
  "graph.goal_label": {
    getSection: getGraphGoalSettingsSection,
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

export function getGraphGoalSettingsSection() {
  return t`Display`;
}

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
