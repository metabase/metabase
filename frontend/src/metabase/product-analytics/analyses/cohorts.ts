import { c, t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnPickerWidget } from "../components/settings/ColumnPickerWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { NumberStepperWidget } from "../components/settings/NumberStepperWidget";
import { countPeriodsInDateRange } from "../date-range";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity } from "../spec/types";
import { COHORT_COLUMN_NAMES } from "../sql/analyses/cohorts";

import {
  getDateColumnOptions,
  getUserPropertyOptions,
  isDateColumnInTable,
  isUserPropertyColumn,
} from "./column-roles";
import { commonSettings, getColumnRoles } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isOneOf,
  isOptionalEventDefinition,
  isPositiveInteger,
  missingIf,
  ready,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  CohortsSettings,
} from "./types";

const COHORT_BYS: readonly CohortsSettings["cohorts.by"][] = [
  "startDate",
  "attribute",
];
const RETURN_RULES: readonly CohortsSettings["cohorts.return_rule"][] = [
  "exactly",
  "onOrAfter",
];
const DISPLAYS: readonly CohortsSettings["cohorts.display"][] = [
  "percent",
  "counts",
];

/** For open-ended date ranges, which have no period count of their own. */
const DEFAULT_HORIZON: Record<Granularity, number> = {
  hour: 24,
  day: 14,
  week: 8,
  month: 6,
};

const SETTINGS: AnalysisSettingDefinitions<CohortsSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
  }),
  "cohorts.by": withWidgetProps({
    getTitle: () => t`Cohort type`,
    getSection: () => "setup",
    widget: SegmentedControl,
    getDefault: () => "startDate",
    isValid: (value) => isOneOf(COHORT_BYS, value),
    getProps: () => ({
      data: [
        { label: t`By start date`, value: "startDate" as const },
        { label: t`By attribute`, value: "attribute" as const },
      ],
      w: "100%",
    }),
  }),
  "cohorts.start_column": withWidgetProps({
    getTitle: () => t`Column that indicates their start date`,
    getSection: () => "setup",
    widget: ColumnPickerWidget,
    getDefault: (_context, settings) => settings["columns.timestamp"] ?? null,
    isValid: (value, context) => isDateColumnInTable(context.table, value),
    getHidden: (_context, settings) => settings["cohorts.by"] !== "startDate",
    getProps: (context) => ({
      columns: getDateColumnOptions(context.table),
      isRequired: true,
    }),
    readDependencies: ["columns.timestamp", "cohorts.by"],
  }),
  "cohorts.attribute": withWidgetProps({
    getTitle: () => t`Property to group users by`,
    getSection: () => "setup",
    widget: ColumnPickerWidget,
    getDefault: () => null,
    isValid: (value, context) => isUserPropertyColumn(context, value),
    getHidden: (_context, settings) => settings["cohorts.by"] !== "attribute",
    getProps: (context, settings) => ({
      columns: getUserPropertyOptions(context, getColumnRoles(settings)),
      isRequired: true,
    }),
    readDependencies: ["cohorts.by"],
  }),
  "cohorts.return": withWidgetProps({
    getTitle: () => t`What do they have to do to count as returning?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any event or action`,
    }),
  }),
  "cohorts.display": withWidgetProps({
    getTitle: () => t`What value do you want to see?`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "percent",
    isValid: (value) => isOneOf(DISPLAYS, value),
    getProps: () => ({
      data: [
        { label: t`Percentages`, value: "percent" as const },
        { label: t`Count of people`, value: "counts" as const },
      ],
      w: "100%",
    }),
  }),
  "cohorts.return_rule": withWidgetProps({
    getTitle: () => t`When does a user need to return?`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "onOrAfter",
    isValid: (value) => isOneOf(RETURN_RULES, value),
    getProps: (_context, settings) => {
      const unit = Lib.describeTemporalUnit(settings.granularity).toLowerCase();
      return {
        data: [
          { label: t`Any time after`, value: "onOrAfter" as const },
          {
            label: c("{0} is a time unit, e.g. week or month")
              .t`In exactly 1 ${unit}`,
            value: "exactly" as const,
          },
        ],
        w: "100%",
      };
    },
  }),
  "cohorts.horizon": {
    getTitle: (_context, settings) => {
      const units = Lib.describeTemporalUnit(settings.granularity, 2);
      return c("{0} is a plural time unit, e.g. Weeks or Months")
        .t`${units} to follow`;
    },
    getSection: () => "advanced",
    secondary: true,
    widget: NumberStepperWidget,
    getDefault: (_context, settings) => {
      const granularity = settings.granularity ?? "week";
      return (
        (settings.date_range === undefined
          ? undefined
          : countPeriodsInDateRange(settings.date_range, granularity)) ??
        DEFAULT_HORIZON[granularity]
      );
    },
    isValid: (value) => isPositiveInteger(value),
    readDependencies: ["granularity", "date_range"],
  },
};

export const COHORTS_CONFIG: AnalysisConfig<"cohorts"> = {
  kind: "cohorts",
  get name() {
    return t`Cohorts`;
  },
  get question() {
    return t`Do people keep coming back?`;
  },
  get setupLabel() {
    return t`Setup`;
  },
  settings: SETTINGS,
  toSpec: (settings, events) => {
    const by = settings["cohorts.by"];
    const returning = settings["cohorts.return"];
    const missing = [
      ...missingIf(
        by === "startDate" && settings["cohorts.start_column"] === null,
        {
          key: "cohorts.start_column",
          message: t`Pick the column that indicates their start date.`,
        },
      ),
      ...missingIf(
        by === "attribute" && settings["cohorts.attribute"] === null,
        {
          key: "cohorts.attribute",
          message: t`Pick a property to group users by.`,
        },
      ),
    ];
    if (missing.length > 0) {
      return incomplete(missing);
    }
    return ready({
      ...getCommonSpec("cohorts", settings),
      cohorts: {
        by,
        // Empty means any event counts as coming back.
        return:
          returning === null ? undefined : { flag: events.flagFor(returning) },
        returnRule: settings["cohorts.return_rule"],
        horizon: settings["cohorts.horizon"],
      },
      output: { cohortsDisplay: settings["cohorts.display"] },
    });
  },
  getExtraColumns: (settings, context) => {
    switch (settings["cohorts.by"]) {
      case "startDate": {
        const column = settings["cohorts.start_column"];
        return column === null
          ? []
          : [{ as: COHORT_COLUMN_NAMES.startDate, column, from: "events" }];
      }
      case "attribute": {
        const column = settings["cohorts.attribute"];
        return column === null
          ? []
          : [
              {
                as: COHORT_COLUMN_NAMES.attribute,
                column,
                from: context.usersTable !== undefined ? "users" : "events",
              },
            ];
      }
    }
  },
  getDisplay: () => "cohort",
  getVizSettings: (settings) => ({
    "cohort.period":
      settings.granularity === "hour" ? "day" : settings.granularity,
    "cohort.value_format": settings["cohorts.display"],
  }),
};
