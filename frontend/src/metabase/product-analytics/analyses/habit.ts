import { t } from "ttag";

import * as Lib from "metabase-lib";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, HabitSpec } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import { grainLabel, grainTitle } from "../sql/compile/grain";

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

const ratioName = (granularity: Granularity): string =>
  toSubPeriod(granularity) === "week" ? t`WAU/MAU` : t`DAU/MAU`;

const SETTINGS: AnalysisSettingDefinitions<HabitSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week"], defaultUnit: "day" },
  }),
  "habit.active": withWidgetProps({
    getTitle: () => t`What event counts as showing up?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any action or event`,
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
      habit: {
        // Empty means any event counts as showing up.
        active: active === null ? undefined : { flag: events.flagFor(active) },
        subPeriod,
        measure: settings["habit.measure"],
      },
      output: {},
    });
  },
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
        return {
          "graph.dimensions": ["periods"],
          "graph.metrics": [people],
          ...getSeriesSettings(people, peopleTitle, pickedColor),
          ...getAxisTitleSettings({
            x:
              toSubPeriod(settings.granularity) === "week"
                ? t`Weeks active`
                : t`Days active`,
            y: peopleTitle,
          }),
        };
      }
      case "ratio": {
        const subPeriod = toSubPeriod(settings.granularity);
        const title = ratioName(settings.granularity);
        return {
          "graph.dimensions": [subPeriod],
          "graph.metrics": ["ratio"],
          ...getSeriesSettings("ratio", title, pickedColor),
          ...getConversionColumnSettings("ratio"),
          ...getAxisTitleSettings({
            x: Lib.describeTemporalUnit(subPeriod),
            y: title,
          }),
        };
      }
    }
  },
  getColorSlots: (_settings, colors) => [getSeriesColorSlot(colors)],
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
