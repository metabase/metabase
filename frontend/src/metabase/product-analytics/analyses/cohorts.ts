import { t } from "ttag";

import { EventPickerWidget } from "../components/settings/EventPickerWidget";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventPickerProps,
  isOneOf,
  isPositiveInteger,
  isValidEvent,
  savedEvent,
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
const INTEGER_PROPS = { options: { isInteger: true, isNonNegative: true } };

const SETTINGS: AnalysisSettingDefinitions<CohortsSettings> = {
  ...commonSettings({
    granularity: { units: ["week", "month"], defaultUnit: "week" },
  }),
  "cohorts.start": {
    getTitle: () => t`Starting event`,
    getSection: () => "setup",
    widget: EventPickerWidget,
    getDefault: () => savedEvent("signup"),
    isValid: (value, context) => isValidEvent(context, value),
    getProps: getEventPickerProps,
  },
  "cohorts.return": {
    getTitle: () => t`Returning event`,
    getSection: () => "setup",
    widget: EventPickerWidget,
    getDefault: () => savedEvent("active"),
    isValid: (value, context) => isValidEvent(context, value),
    getProps: getEventPickerProps,
  },
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
    widget: "number",
    getDefault: (_context, settings) =>
      settings.granularity === "month" ? 6 : 8,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
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
    widget: "number",
    getDefault: () => 8,
    isValid: (value) => isPositiveInteger(value),
    getHidden: (_context, settings) =>
      settings["cohorts.row_mode"] !== "started",
    getProps: () => INTEGER_PROPS,
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
  getEventRefs: (settings) => [
    settings["cohorts.start"],
    settings["cohorts.return"],
  ],
  toSpec: (settings, events) => ({
    ...getCommonSpec("cohorts", settings),
    cohorts: {
      rowMode: settings["cohorts.row_mode"],
      start: { flag: events.flagFor(settings["cohorts.start"]) },
      startPeriods: settings["cohorts.start_periods"],
      return: { flag: events.flagFor(settings["cohorts.return"]) },
      returnRule: settings["cohorts.return_rule"],
      horizon: settings["cohorts.horizon"],
    },
    output: { cohortsDisplay: settings["cohorts.display"] },
  }),
  getDisplay: () => "table",
  getVizSettings: () => ({}),
};
