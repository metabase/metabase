import { msgid, ngettext, t } from "ttag";

import type { SegmentedControlItem } from "metabase/ui";
import { isOneOf } from "metabase-types/guards";

import { getTableQuery } from "../base-query";
import { SegmentedControlWidget } from "../components/SegmentedControlWidget";
import { EventDefinitionWidget } from "../components/event-definition/EventDefinitionWidget";
import { isJsEventDefinition } from "../event-definition";

import { getCommonSettings } from "./common-settings";
import {
  getAxisTitleSettings,
  getPercentColumnSettings,
  getSeriesSettings,
} from "./series-settings";
import type {
  AnalysisConfig,
  CommonSettingsOptions,
  HabitValues,
} from "./types";
import { withWidgetProps } from "./with-widget-props";

/** The planner's result columns. */
const PERIODS_COLUMN = "periods";
const PEOPLE_COLUMN = "people";

const HABIT_VALUES: readonly HabitValues[] = ["count", "percent"];

const getHabitValuesItems = (): SegmentedControlItem<HabitValues>[] => [
  { label: t`People`, value: "count" },
  { label: t`Percent of total`, value: "percent" },
];

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
    "habit.values": withWidgetProps("habit.values", {
      getTitle: () => t`What value do you want to see?`,
      widget: SegmentedControlWidget,
      getDefault: (): HabitValues => "count",
      isValid: (_context, settings) =>
        isOneOf(HABIT_VALUES, settings["habit.values"]),
      getProps: () => ({ data: getHabitValuesItems() }),
    }),
  },
  getTitle: ({ granularity }) =>
    granularity === "week"
      ? t`How many weeks did people show up?`
      : t`How many days did people show up?`,
  getDisplay: () => "bar",
  getVizSettings: (settings) => {
    const isPercent = settings["habit.values"] === "percent";
    return {
      "graph.dimensions": [PERIODS_COLUMN],
      "graph.metrics": [PEOPLE_COLUMN],
      ...getSeriesSettings(PEOPLE_COLUMN, t`People`),
      ...(isPercent ? getPercentColumnSettings(PEOPLE_COLUMN) : {}),
      ...getAxisTitleSettings({
        x: settings.granularity === "week" ? t`Weeks active` : t`Days active`,
        y: isPercent ? t`Percent of total` : t`People`,
      }),
    };
  },
  describeDrill: ({ granularity }, { dimensions }) => {
    const periods = dimensions.find(
      ({ column }) => column === PERIODS_COLUMN,
    )?.value;
    if (typeof periods !== "number") {
      return null;
    }
    return granularity === "week"
      ? ngettext(
          msgid`People active in ${periods} week`,
          `People active in ${periods} weeks`,
          periods,
        )
      : ngettext(
          msgid`People active on ${periods} day`,
          `People active on ${periods} days`,
          periods,
        );
  },
};
