import { t } from "ttag";

import { getTableQuery } from "../base-query";
import { EventDefinitionWidget } from "../components/event-definition/EventDefinitionWidget";
import { isJsEventDefinition } from "../event-definition";

import { getCommonSettings } from "./common-settings";
import { getAxisTitleSettings, getSeriesSettings } from "./series-settings";
import type { AnalysisConfig, CommonSettingsOptions } from "./types";
import { withWidgetProps } from "./with-widget-props";

/** The planner's result columns. */
const PERIODS_COLUMN = "periods";
const PEOPLE_COLUMN = "people";

const HABIT_OPTIONS: CommonSettingsOptions = {
  grains: ["person"],
  granularities: ["day", "week"],
};

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  options: HABIT_OPTIONS,
  settings: {
    ...getCommonSettings(HABIT_OPTIONS),
    "habit.active": withWidgetProps("habit.active", {
      getTitle: () => t`What event counts as showing up?`,
      widget: EventDefinitionWidget,
      getDefault: () => null,
      isValid: (_context, settings) =>
        settings["habit.active"] === null ||
        isJsEventDefinition(settings["habit.active"]),
      getProps: ({ table, metadataProvider }) => ({
        tableQuery: getTableQuery(metadataProvider, table.id),
        emptyLabel: t`Any event`,
      }),
    }),
  },
  getTitle: ({ granularity }) =>
    granularity === "week"
      ? t`How many weeks did people show up?`
      : t`How many days did people show up?`,
  getDisplay: () => "bar",
  getVizSettings: ({ granularity }) => ({
    "graph.dimensions": [PERIODS_COLUMN],
    "graph.metrics": [PEOPLE_COLUMN],
    ...getSeriesSettings(PEOPLE_COLUMN, t`People`),
    ...getAxisTitleSettings({
      x: granularity === "week" ? t`Weeks active` : t`Days active`,
      y: t`People`,
    }),
  }),
};
