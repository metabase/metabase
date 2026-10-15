import { t } from "ttag";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { NumberStepperWidget } from "../components/settings/NumberStepperWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import { pointString } from "../sql/analyses/base";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isOneOf,
  isOptionalEventDefinition,
  isPositiveDuration,
  isPositiveInteger,
  ready,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  HabitSettings,
} from "./types";

const SUB_PERIODS: readonly HabitSettings["habit.sub_period"][] = [
  "day",
  "week",
];
const MEASURES: readonly HabitSettings["habit.measure"][] = [
  "histogram",
  "ratio",
  "threshold",
];

const SETTINGS: AnalysisSettingDefinitions<HabitSettings> = {
  ...commonSettings({ granularity: null }),
  "habit.active": withWidgetProps({
    getTitle: () => t`What event counts as showing up?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: getEventDefinitionProps,
  }),
  "habit.lookback": {
    getTitle: () => t`Look back`,
    getSection: () => "setup",
    widget: DurationWidget,
    getDefault: () => ({ value: 28, unit: "day" }),
    isValid: (value) => isPositiveDuration(value),
    getProps: () => ({ units: ["day", "week"] }),
  },
  "habit.sub_period": {
    getTitle: () => t`Count active`,
    getSection: () => "setup",
    widget: "segmentedControl",
    getDefault: () => "day",
    isValid: (value) => isOneOf(SUB_PERIODS, value),
    getProps: () => ({
      options: [
        { name: t`Days`, value: "day" },
        { name: t`Weeks`, value: "week" },
      ],
    }),
  },
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
      settings["habit.sub_period"] === "week" ? 2 : 5,
    isValid: (value) => isPositiveInteger(value),
    getHidden: (_context, settings) =>
      settings["habit.measure"] !== "threshold",
    readDependencies: ["habit.measure", "habit.sub_period"],
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
    if (active === null) {
      return incomplete([
        {
          key: "habit.active",
          message: t`Define the event that counts as showing up.`,
        },
      ]);
    }
    return ready({
      ...getCommonSpec("habit", settings),
      habit: {
        active: { flag: events.flagFor(active) },
        lookback: settings["habit.lookback"],
        subPeriod: settings["habit.sub_period"],
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
        return settings["habit.sub_period"] === "day"
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
