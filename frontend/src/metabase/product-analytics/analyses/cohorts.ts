import { c, t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  type RetentionCurvesView,
  getCohortTableSettings,
  getRetentionCurvesSettings,
} from "../cohorts/retention-curves";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { withWidgetProps } from "../settings/with-widget-props";
import {
  COHORT_ATTRIBUTE_COLUMN,
  toCohortPeriod,
} from "../sql/analyses/cohorts";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  isOneOf,
  isOptionalEventDefinition,
  ready,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  CohortsSettings,
} from "./types";

const VIEWS: readonly CohortsSettings["cohorts.view"][] = ["table", "curves"];
const RETURN_RULES: readonly CohortsSettings["cohorts.return_rule"][] = [
  "exactly",
  "onOrAfter",
];
const DISPLAYS: readonly CohortsSettings["cohorts.display"][] = [
  "percent",
  "counts",
];
const LINES: readonly CohortsSettings["cohorts.lines"][] = ["each", "average"];
const X_AXES: readonly CohortsSettings["cohorts.x_axis"][] = [
  "sinceStart",
  "date",
];

/** Broken out, cohorts are a property's values rather than start periods. */
const isGrouped = (settings: Partial<CohortsSettings>) =>
  (settings.breakout ?? null) !== null;

const isTable = (settings: Partial<CohortsSettings>) =>
  settings["cohorts.view"] !== "curves";

/**
 * The table has a row per cohort, and grouped by an attribute, each line
 * already pools every start period.
 */
const canShowEachOrAverage = (settings: Partial<CohortsSettings>) =>
  !isTable(settings) && !isGrouped(settings);

/**
 * Dates line up a bad week across cohorts, but only when returning means
 * coming back in that period: "or later" counts people who skipped it.
 */
const canShowDates = (settings: Partial<CohortsSettings>) =>
  canShowEachOrAverage(settings) &&
  settings["cohorts.lines"] === "each" &&
  settings["cohorts.return_rule"] === "exactly";

const getView = (settings: CohortsSettings): RetentionCurvesView => {
  const lines = canShowEachOrAverage(settings)
    ? settings["cohorts.lines"]
    : "each";
  return {
    period: toCohortPeriod(settings.granularity),
    isPercent: settings["cohorts.display"] === "percent",
    lines,
    xAxis: canShowDates(settings) ? settings["cohorts.x_axis"] : "sinceStart",
  };
};

const SETTINGS: AnalysisSettingDefinitions<CohortsSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
    breakout: true,
  }),
  "cohorts.start": withWidgetProps({
    getTitle: () => t`What do they have to do to start?`,
    getHint: () =>
      t`Each person's clock starts the first time they do it in the date range, even if they did it before.`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any action or event`,
    }),
  }),
  "cohorts.return": withWidgetProps({
    getTitle: () => t`What do they have to do to count as returning?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any action or event`,
    }),
  }),
  "cohorts.view": withWidgetProps({
    getTitle: () => t`How to display the cohorts`,
    getSection: () => "setup",
    widget: SegmentedControl,
    getDefault: () => "table",
    isValid: (value) => isOneOf(VIEWS, value),
    getProps: () => ({
      data: [
        { label: t`Table`, value: "table" as const },
        { label: t`Retention curves`, value: "curves" as const },
      ],
      w: "100%",
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
    getTitle: () => t`Counts as retained if they return…`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "exactly",
    isValid: (value) => isOneOf(RETURN_RULES, value),
    getProps: (_context, settings) => {
      const unit = Lib.describeTemporalUnit(settings.granularity).toLowerCase();
      return {
        data: [
          {
            label: c("{0} is a time unit, e.g. week or month")
              .t`In that ${unit}`,
            value: "exactly" as const,
          },
          {
            label: c("{0} is a time unit, e.g. week or month")
              .t`In that ${unit} or later`,
            value: "onOrAfter" as const,
          },
        ],
        w: "100%",
      };
    },
  }),
  "cohorts.lines": withWidgetProps({
    getTitle: () => t`Which lines do you want to see?`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "each",
    isValid: (value) => isOneOf(LINES, value),
    getHidden: (_context, settings) => !canShowEachOrAverage(settings),
    getProps: () => ({
      data: [
        { label: t`Each cohort`, value: "each" as const },
        { label: t`Average`, value: "average" as const },
      ],
      w: "100%",
    }),
    readDependencies: ["cohorts.view", "breakout"],
  }),
  "cohorts.x_axis": withWidgetProps({
    getTitle: () => t`X-axis`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "sinceStart",
    isValid: (value) => isOneOf(X_AXES, value),
    getHidden: (_context, settings) => !canShowDates(settings),
    getProps: (_context, settings) => {
      const units = Lib.describeTemporalUnit(settings.granularity, 2);
      return {
        data: [
          {
            label: c("{0} is a plural time unit, e.g. Weeks")
              .t`${units} since start`,
            value: "sinceStart" as const,
          },
          { label: t`Date`, value: "date" as const },
        ],
        w: "100%",
      };
    },
    readDependencies: [
      "cohorts.view",
      "breakout",
      "cohorts.lines",
      "cohorts.return_rule",
    ],
  }),
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
    const start = settings["cohorts.start"];
    const returning = settings["cohorts.return"];
    return ready({
      ...getCommonSpec("cohorts", settings),
      cohorts: {
        // Empty means any event starts the clock, or counts as coming back.
        start: start === null ? undefined : { flag: events.flagFor(start) },
        by: isGrouped(settings) ? "attribute" : "startDate",
        return:
          returning === null ? undefined : { flag: events.flagFor(returning) },
        returnRule: settings["cohorts.return_rule"],
      },
      output: {
        cohortsDisplay: settings["cohorts.display"],
        cohortsLines: getView(settings).lines,
      },
    });
  },
  getExtraColumns: (settings, context) => {
    const column = settings.breakout;
    return column === null
      ? []
      : [
          {
            as: COHORT_ATTRIBUTE_COLUMN,
            column,
            from: context.usersTable !== undefined ? "users" : "events",
          },
        ];
  },
  getDisplay: (settings) => {
    if (isTable(settings)) {
      return "cohort";
    }
    const view = getView(settings);
    // Counts by date stack into active people per period, by the cohort they started in.
    return view.xAxis === "date" && !view.isPercent ? "area" : "line";
  },
  getVizSettings: (settings) =>
    isTable(settings)
      ? getCohortTableSettings(getView(settings))
      : getRetentionCurvesSettings(getView(settings)),
};
