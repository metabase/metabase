import { t } from "ttag";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { NumberStepperWidget } from "../components/settings/NumberStepperWidget";
import { withWidgetProps } from "../settings/with-widget-props";

import { commonSettings } from "./common-settings";
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

const RETURN_RULES: readonly CohortsSettings["cohorts.return_rule"][] = [
  "exactly",
  "onOrAfter",
];
const ROW_MODES: readonly CohortsSettings["cohorts.row_mode"][] = [
  "defined",
  "started",
];
const DISPLAYS: readonly CohortsSettings["cohorts.display"][] = [
  "percent",
  "counts",
];

const SETTINGS: AnalysisSettingDefinitions<CohortsSettings> = {
  ...commonSettings({
    granularity: { units: ["week", "month"], defaultUnit: "week" },
  }),
  "cohorts.start": withWidgetProps({
    getTitle: () => t`Starting event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: getEventDefinitionProps,
  }),
  "cohorts.return": withWidgetProps({
    getTitle: () => t`Returning event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: getEventDefinitionProps,
  }),
  "cohorts.return_rule": {
    getTitle: () => t`Counts as returning`,
    getSection: () => "setup",
    widget: "segmentedControl",
    getDefault: () => "onOrAfter",
    isValid: (value) => isOneOf(RETURN_RULES, value),
    getProps: () => ({
      options: [
        { name: t`In that period`, value: "exactly" },
        { name: t`Then or later`, value: "onOrAfter" },
      ],
    }),
  },
  "cohorts.horizon": {
    getTitle: () => t`Periods to follow`,
    getSection: () => "setup",
    widget: NumberStepperWidget,
    getDefault: (_context, settings) =>
      settings.granularity === "month" ? 6 : 8,
    isValid: (value) => isPositiveInteger(value),
    readDependencies: ["granularity"],
  },
  "cohorts.display": {
    getTitle: () => t`Show`,
    getSection: () => "setup",
    widget: "segmentedControl",
    getDefault: () => "percent",
    isValid: (value) => isOneOf(DISPLAYS, value),
    getProps: () => ({
      options: [
        { name: t`Percent`, value: "percent" },
        { name: t`Counts`, value: "counts" },
      ],
    }),
  },
  "cohorts.row_mode": {
    getTitle: () => t`Cohorts`,
    getSection: () => "advanced",
    widget: "segmentedControl",
    getDefault: () => "started",
    isValid: (value) => isOneOf(ROW_MODES, value),
    getProps: () => ({
      options: [
        { name: t`All`, value: "defined" },
        { name: t`The first few`, value: "started" },
      ],
    }),
  },
  "cohorts.start_periods": {
    getTitle: () => t`Cohorts to show`,
    getSection: () => "advanced",
    widget: NumberStepperWidget,
    getDefault: () => 8,
    isValid: (value) => isPositiveInteger(value),
    getHidden: (_context, settings) =>
      settings["cohorts.row_mode"] !== "started",
    readDependencies: ["cohorts.row_mode"],
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
    const start = settings["cohorts.start"];
    const returning = settings["cohorts.return"];
    if (start === null || returning === null) {
      return incomplete([
        ...missingIf(start === null, {
          key: "cohorts.start",
          message: t`Define the event that starts a cohort.`,
        }),
        ...missingIf(returning === null, {
          key: "cohorts.return",
          message: t`Define the event that counts as coming back.`,
        }),
      ]);
    }
    return ready({
      ...getCommonSpec("cohorts", settings),
      cohorts: {
        rowMode: settings["cohorts.row_mode"],
        start: { flag: events.flagFor(start) },
        startPeriods: settings["cohorts.start_periods"],
        return: { flag: events.flagFor(returning) },
        returnRule: settings["cohorts.return_rule"],
        horizon: settings["cohorts.horizon"],
      },
      output: { cohortsDisplay: settings["cohorts.display"] },
    });
  },
  getDisplay: () => "table",
  getVizSettings: () => ({}),
};
