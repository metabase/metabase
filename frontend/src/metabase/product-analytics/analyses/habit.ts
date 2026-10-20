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
  getAxisTitleSettings,
  getConversionColumnSettings,
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
    getTitle: () => t`Measure`,
    getSection: () => "setup",
    widget: "select",
    getDefault: () => "histogram",
    isValid: (value) => isOneOf(MEASURES, value),
    getProps: (_context, settings) => ({
      options: [
        { name: t`How often people show up`, value: "histogram" },
        { name: ratioName(settings.granularity), value: "ratio" },
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
  getVizSettings: (settings) => {
    switch (settings["habit.measure"]) {
      case "histogram": {
        const people = grainLabel(settings.counting);
        const peopleTitle = grainTitle(settings.counting);
        return {
          "graph.dimensions": ["periods"],
          "graph.metrics": [people],
          ...getSeriesSettings(people, peopleTitle),
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
          ...getSeriesSettings("ratio", title),
          ...getConversionColumnSettings("ratio"),
          ...getAxisTitleSettings({
            x: Lib.describeTemporalUnit(subPeriod),
            y: title,
          }),
        };
      }
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
        const subPeriod = toSubPeriod(settings.granularity);
        const period = formatPeriod(point[subPeriod], subPeriod);
        return subPeriod === "day"
          ? t`Active on ${period}`
          : t`Active in ${period}`;
      }
    }
  },
};
