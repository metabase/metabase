import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, HabitSpec } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../sql/analyses/breakout";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import {
  getBreakoutChartsSettings,
  getBreakoutExtraColumns,
  getBreakoutSeriesSettings,
  getBreakoutSpec,
  getStackBreakoutsTitle,
} from "./breakout";
import { commonSettings } from "./common-settings";
import {
  SERIES_COLOR_KEY,
  getAxisTitleSettings,
  getConversionColumnSettings,
  getSeriesColorSlot,
  getSeriesSettings,
} from "./series-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  isBoolean,
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

const SETTINGS: AnalysisSettingDefinitions<HabitSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week"], defaultUnit: "day" },
    breakout: true,
  }),
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
  "habit.stack_breakouts": {
    getTitle: getStackBreakoutsTitle,
    getSection: () => "setup",
    inline: true,
    widget: "toggle",
    getDefault: () => true,
    isValid: (value) => isBoolean(value),
    // The ratio is always a line per group.
    getHidden: (_context, settings) =>
      settings.breakout == null || settings["habit.measure"] !== "histogram",
    readDependencies: ["breakout", "habit.measure"],
  },
};

/**
 * Broken out, a series per group in the groups' colors: the ratio's lines,
 * or the histogram's bars side by side. Otherwise one series, in the color
 * the display panel picked.
 */
const isSeriesPerGroup = (settings: HabitSettings) =>
  settings.breakout !== null &&
  (settings["habit.measure"] === "ratio" || !settings["habit.stack_breakouts"]);

/** The x-axis, then the groups when each has a series. */
const getDimensions = (settings: HabitSettings, x: string): string[] =>
  isSeriesPerGroup(settings) ? [x, BREAKOUT_COLUMN] : [x];

/** The groups' colors when each has a series, else the picked color. */
const getHabitSeriesSettings = (
  settings: HabitSettings,
  metric: string,
  title: string,
  pickedColor: string | undefined,
) =>
  isSeriesPerGroup(settings)
    ? getBreakoutSeriesSettings(settings.breakout)
    : getSeriesSettings(metric, title, pickedColor);

/** Broken out without a series per group, the histogram gets a chart per group. */
const isChartPerGroup = (settings: HabitSettings) =>
  settings.breakout !== null && !isSeriesPerGroup(settings);

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
        return isChartPerGroup(settings) ? "small_multiples" : "bar";
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
        return {
          "graph.dimensions": getDimensions(settings, "periods"),
          "graph.metrics": [people],
          ...(isChartPerGroup(settings)
            ? getBreakoutChartsSettings("bar")
            : {}),
          ...getHabitSeriesSettings(settings, people, peopleTitle, pickedColor),
          ...(isPercent ? getConversionColumnSettings(people) : {}),
          ...getAxisTitleSettings({
            x:
              toSubPeriod(settings.granularity) === "week"
                ? t`Weeks active`
                : t`Days active`,
            y: isPercent ? getPercentLabel(settings) : peopleTitle,
          }),
        };
      }
      case "ratio": {
        const subPeriod = toSubPeriod(settings.granularity);
        const title = ratioName(settings.granularity);
        return {
          "graph.dimensions": getDimensions(settings, subPeriod),
          "graph.metrics": ["ratio"],
          ...getHabitSeriesSettings(settings, "ratio", title, pickedColor),
          ...getConversionColumnSettings("ratio"),
          ...getAxisTitleSettings({
            x: Lib.describeTemporalUnit(subPeriod),
            y: title,
          }),
        };
      }
    }
  },
  getColorSlots: (settings, colors) =>
    isSeriesPerGroup(settings) ? [] : [getSeriesColorSlot(colors)],
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
