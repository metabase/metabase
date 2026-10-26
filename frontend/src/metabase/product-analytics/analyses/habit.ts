import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, HabitSpec } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../sql/analyses/breakout";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import {
  getBreakoutExtraColumns,
  getBreakoutSeriesSettings,
  getBreakoutSpec,
  getStackedGroupsSettings,
} from "./breakout";
import { commonSettings, hasSessionColumn } from "./common-settings";
import {
  SERIES_COLOR_KEY,
  type TooltipColumn,
  getActivityTooltipColumns,
  getAxisTitleSettings,
  getConversionColumnSettings,
  getSeriesColorSlot,
  getSeriesSettings,
  withTooltipColumns,
} from "./series-settings";
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
  HabitSettings,
} from "./types";

/** The toolbar's granularity is the sub-period people are counted active in. */
const toSubPeriod = (granularity: Granularity): HabitSpec["subPeriod"] =>
  granularity === "week" ? "week" : "day";

const MEASURES: readonly HabitSettings["habit.measure"][] = [
  "histogram",
  "ratio",
];

const VALUES: readonly HabitSettings["habit.values"][] = ["counts", "percent"];

const getPercentLabel = (settings: Partial<HabitSettings>): string =>
  (settings.breakout ?? null) !== null
    ? t`Percent of the group`
    : t`Percent of total`;

const ratioName = (granularity: Granularity): string =>
  toSubPeriod(granularity) === "week" ? t`WAU/MAU` : t`DAU/MAU`;

const { breakout_view: breakoutView, ...common } = commonSettings({
  granularity: { units: ["day", "week"], defaultUnit: "day" },
  breakout: true,
  canPivot: true,
  grains: ["person"],
});

const SETTINGS: AnalysisSettingDefinitions<HabitSettings> = {
  ...common,
  "habit.active": withWidgetProps({
    getTitle: () => t`What event counts as showing up?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any event`,
    }),
  }),
  "habit.measure": {
    getTitle: () => t`What to measure`,
    getSection: () => "setup",
    widget: "radio",
    getDefault: () => "histogram",
    isValid: (value) => isOneOf(MEASURES, value),
    getProps: (_context, settings) => ({
      options: [
        { name: t`How often people show up`, value: "histogram" },
        {
          name:
            toSubPeriod(settings.granularity) === "week"
              ? t`Ratio of weekly to monthly users (WAU/MAU)`
              : t`Ratio of daily to monthly users (DAU/MAU)`,
          value: "ratio",
        },
      ],
    }),
  },
  "habit.values": withWidgetProps({
    getTitle: () => t`What value do you want to see?`,
    getSection: () => "setup",
    widget: SegmentedControl,
    getDefault: () => "counts",
    isValid: (value) => isOneOf(VALUES, value),
    // The ratio is already a share.
    getHidden: (_context, settings) =>
      settings["habit.measure"] !== "histogram",
    getProps: (_context, settings) => ({
      data: [
        { label: grainTitle(settings.counting), value: "counts" as const },
        {
          label: getPercentLabel(settings),
          value: "percent" as const,
        },
      ],
      w: "100%",
    }),
    readDependencies: ["habit.measure", "counting", "breakout"],
  }),
  // Last in setup, under what it shows. The ratio's line per group already
  // reads like a table's columns.
  breakout_view: {
    ...breakoutView,
    getHidden: (context, settings) =>
      settings["habit.measure"] === "ratio" ||
      (breakoutView.getHidden?.(context, settings) ?? false),
    readDependencies: ["breakout", "habit.measure"],
  },
};

/**
 * Broken out, a series per group in the groups' colors: the ratio's lines,
 * or the histogram's bars, a chart per group with "Stack series" on. Otherwise
 * one series, in the color the display panel picked.
 */
const getHabitSeriesSettings = (
  settings: HabitSettings,
  x: string,
  metric: string,
  title: string,
  pickedColor: string | undefined,
): VisualizationSettings =>
  settings.breakout !== null
    ? {
        "graph.dimensions": [x, BREAKOUT_COLUMN],
        ...getBreakoutSeriesSettings(settings.breakout),
      }
    : {
        "graph.dimensions": [x],
        ...getSeriesSettings(metric, title, pickedColor),
      };

/** Both views average over each person's active days, or weeks. */
const getHabitTooltipColumns = (settings: HabitSettings): TooltipColumn[] => {
  const isWeekly = toSubPeriod(settings.granularity) === "week";
  return getActivityTooltipColumns({
    hasSessions: hasSessionColumn(settings),
    eventsTitle: isWeekly
      ? t`Events per active week`
      : t`Events per active day`,
    sessionsTitle: isWeekly
      ? t`Sessions per active week`
      : t`Sessions per active day`,
  });
};

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  kind: "habit",
  get name() {
    return t`Habit`;
  },
  get question() {
    return t`How many days in a row did people show up?`;
  },
  getQuestion: (settings) => {
    const isWeekly = toSubPeriod(settings.granularity) === "week";
    if (settings["habit.measure"] === "histogram") {
      return isWeekly
        ? t`How many weeks in a row did people show up?`
        : HABIT_CONFIG.question;
    }
    return isWeekly
      ? t`What share of monthly users show up each week?`
      : t`What share of monthly users show up each day?`;
  },
  get setupLabel() {
    return t`Setup`;
  },
  settings: SETTINGS,
  toSpec: (settings, events) => {
    const active = settings["habit.active"];
    const subPeriod = toSubPeriod(settings.granularity);
    return ready({
      ...getCommonSpec("habit", settings),
      breakout: getBreakoutSpec(settings.breakout, events),
      habit: {
        // Empty means any event counts as showing up.
        active: active === null ? undefined : { flag: events.flagFor(active) },
        subPeriod,
        measure: settings["habit.measure"],
        percent: settings["habit.values"] === "percent",
      },
      output: {},
    });
  },
  getExtraColumns: ({ breakout }, context) =>
    getBreakoutExtraColumns(breakout, context),
  getDisplay: (settings) => {
    switch (settings["habit.measure"]) {
      case "histogram":
        return "bar";
      case "ratio":
        return "line";
    }
  },
  getVizSettings: (settings, colors) => {
    const pickedColor = colors[SERIES_COLOR_KEY];
    switch (settings["habit.measure"]) {
      case "histogram": {
        const people = grainLabel(settings.counting);
        const peopleTitle = grainTitle(settings.counting);
        const isPercent = settings["habit.values"] === "percent";
        const isWeekly = toSubPeriod(settings.granularity) === "week";
        return withTooltipColumns(
          {
            "graph.metrics": [people],
            ...getHabitSeriesSettings(
              settings,
              "periods",
              people,
              peopleTitle,
              pickedColor,
            ),
            ...(settings.breakout !== null ? getStackedGroupsSettings() : {}),
            ...(isPercent ? getConversionColumnSettings(people) : {}),
            ...getAxisTitleSettings({
              x: isWeekly ? t`Weeks active` : t`Days active`,
              y: isPercent ? getPercentLabel(settings) : peopleTitle,
            }),
          },
          getHabitTooltipColumns(settings),
        );
      }
      case "ratio": {
        const subPeriod = toSubPeriod(settings.granularity);
        const title = ratioName(settings.granularity);
        return withTooltipColumns(
          {
            "graph.metrics": ["ratio"],
            ...getHabitSeriesSettings(
              settings,
              subPeriod,
              "ratio",
              title,
              pickedColor,
            ),
            ...getConversionColumnSettings("ratio"),
            ...getAxisTitleSettings({
              x: Lib.describeTemporalUnit(subPeriod),
              y: title,
            }),
          },
          getHabitTooltipColumns(settings),
        );
      }
    }
  },
  getColorSlots: (settings, colors) =>
    settings.breakout !== null ? [] : [getSeriesColorSlot(colors)],
  describePoint: (settings, point) => {
    switch (settings["habit.measure"]) {
      case "histogram": {
        const periods = pointString(point.periods);
        if (periods === null) {
          return null;
        }
        return toSubPeriod(settings.granularity) === "day"
          ? t`Active on ${periods} different days`
          : t`Active in ${periods} different weeks`;
      }
      case "ratio": {
        const subPeriod = toSubPeriod(settings.granularity);
        const period = formatPeriod(point[subPeriod], subPeriod);
        return subPeriod === "day"
          ? t`Active on ${period}`
          : t`Active in ${period}`;
      }
    }
  },
};
