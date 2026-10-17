import { t } from "ttag";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { NumberStepperWidget } from "../components/settings/NumberStepperWidget";
import { countPeriodsInDateRange } from "../date-range";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, HabitSpec } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  isOneOf,
  isOptionalEventDefinition,
  isPositiveInteger,
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
  "threshold",
];

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
    getTitle: () => t`Measure`,
    getSection: () => "setup",
    widget: "select",
    getDefault: () => "histogram",
    isValid: (value) => isOneOf(MEASURES, value),
    getProps: () => ({
      options: [
        { name: t`How often people show up`, value: "histogram" },
        { name: t`Daily over monthly actives`, value: "ratio" },
        { name: t`Share of regulars`, value: "threshold" },
      ],
    }),
  },
  "habit.threshold": {
    getTitle: () => t`Regulars are active at least`,
    getSection: () => "setup",
    widget: NumberStepperWidget,
    getDefault: (_context, settings) =>
      toSubPeriod(settings.granularity ?? "day") === "week" ? 2 : 5,
    isValid: (value) => isPositiveInteger(value),
    getHidden: (_context, settings) =>
      settings["habit.measure"] !== "threshold",
    readDependencies: ["habit.measure", "granularity"],
  },
};

export const HABIT_CONFIG: AnalysisConfig<"habit"> = {
  kind: "habit",
  get name() {
    return t`Habit`;
  },
  get question() {
    return t`How many days did a person show up?`;
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
        periods: countPeriodsInDateRange(settings.date_range, subPeriod),
        measure: settings["habit.measure"],
        threshold: settings["habit.threshold"],
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
      case "threshold":
        return "table";
    }
  },
  getVizSettings: (settings) => {
    switch (settings["habit.measure"]) {
      case "histogram": {
        const people = grainLabel(settings.counting);
        return {
          "graph.dimensions": ["periods"],
          "graph.metrics": [people],
          series_settings: {
            [people]: { title: grainTitle(settings.counting) },
          },
        };
      }
      case "ratio":
        return {
          "graph.dimensions": ["day"],
          "graph.metrics": ["ratio"],
          series_settings: { ratio: { title: t`Daily over monthly actives` } },
        };
      case "threshold":
        return {};
    }
  },
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
        const day = formatPeriod(point.day, "day");
        return t`Active on ${day}`;
      }
      case "threshold":
        return null;
    }
  },
};
