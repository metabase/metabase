import { t } from "ttag";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventListWidget } from "../components/settings/EventListWidget";
import { grainLabel } from "../sql/compile/grain";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventPickerProps,
  isBoolean,
  isOneOf,
  isPositiveDuration,
  isValidEventList,
  savedEvent,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  FunnelSettings,
} from "./types";

const MIN_STEPS = 2;
const VIEWS: readonly FunnelSettings["funnel.view"][] = [
  "steps",
  "overTime",
  "timeToConvert",
];
const ORDERINGS: readonly FunnelSettings["funnel.ordering"][] = [
  "strict",
  "loose",
  "any",
];
const ANCHORS: readonly FunnelSettings["funnel.anchor"][] = ["first", "each"];

const common = commonSettings({
  granularity: { units: ["hour", "day", "week", "month"], defaultUnit: "week" },
});

const SETTINGS: AnalysisSettingDefinitions<FunnelSettings> = {
  ...common,
  granularity: {
    ...common.granularity,
    getHidden: (_context, settings) => settings["funnel.view"] !== "overTime",
    readDependencies: ["funnel.view"],
  },
  "funnel.steps": {
    getTitle: () => t`Steps`,
    getSection: () => "setup",
    widget: EventListWidget,
    getDefault: () => [
      savedEvent("pricing"),
      savedEvent("trial"),
      savedEvent("checkout"),
    ],
    isValid: (value, context) => isValidEventList(context, value, MIN_STEPS),
    getProps: (context) => ({
      ...getEventPickerProps(context),
      minCount: MIN_STEPS,
    }),
  },
  "funnel.view": {
    getTitle: () => t`Show`,
    getSection: () => "setup",
    widget: "segmentedControl",
    getDefault: () => "steps",
    isValid: (value) => isOneOf(VIEWS, value),
    getProps: () => ({
      options: [
        { name: t`Steps`, value: "steps" },
        { name: t`Over time`, value: "overTime" },
        { name: t`Time to convert`, value: "timeToConvert" },
      ],
    }),
  },
  "funnel.window": {
    getTitle: () => t`Conversion window`,
    getSection: () => "advanced",
    widget: DurationWidget,
    getDefault: () => ({ value: 30, unit: "day" }),
    isValid: (value) => isPositiveDuration(value),
  },
  "funnel.ordering": {
    getTitle: () => t`Step order`,
    getSection: () => "advanced",
    widget: "select",
    getDefault: () => "loose",
    isValid: (value) => isOneOf(ORDERINGS, value),
    getProps: () => ({
      options: [
        { name: t`Strict: nothing in between`, value: "strict" },
        { name: t`Loose: in order`, value: "loose" },
        { name: t`Any order`, value: "any" },
      ],
    }),
  },
  "funnel.anchor": {
    getTitle: () => t`Count conversions from`,
    getSection: () => "advanced",
    widget: "segmentedControl",
    getDefault: () => "first",
    isValid: (value) => isOneOf(ANCHORS, value),
    getProps: () => ({
      options: [
        { name: t`First time`, value: "first" },
        { name: t`Each time`, value: "each" },
      ],
    }),
  },
  "funnel.allow_retry": {
    getTitle: () => t`Allow retrying a step`,
    getSection: () => "advanced",
    widget: "toggle",
    getDefault: () => false,
    isValid: (value) => isBoolean(value),
  },
};

export const FUNNEL_CONFIG: AnalysisConfig<"funnel"> = {
  kind: "funnel",
  get name() {
    return t`Funnel`;
  },
  get question() {
    return t`Where do people fall out?`;
  },
  get setupLabel() {
    return t`Steps`;
  },
  settings: SETTINGS,
  getEventRefs: (settings) => settings["funnel.steps"],
  toSpec: (settings, events) => ({
    ...getCommonSpec("funnel", settings),
    funnel: {
      steps: settings["funnel.steps"].map((ref, index) => ({
        index,
        flag: events.flagFor(ref),
        label: events.nameFor(ref),
      })),
      exclusions: [],
      window: settings["funnel.window"],
      anchor: settings["funnel.anchor"],
      ordering: settings["funnel.ordering"],
      allowRetry: settings["funnel.allow_retry"],
    },
    output: { funnelView: settings["funnel.view"] },
  }),
  getDisplay: (settings) => {
    switch (settings["funnel.view"]) {
      case "steps":
        return "funnel";
      case "overTime":
        return "line";
      case "timeToConvert":
        return "bar";
    }
  },
  getVizSettings: (settings) => {
    const people = grainLabel(settings.counting);
    switch (settings["funnel.view"]) {
      case "steps":
        return { "funnel.dimension": "label", "funnel.metric": people };
      case "overTime":
        return {
          "graph.dimensions": ["period"],
          "graph.metrics": ["conversion"],
        };
      case "timeToConvert":
        return { "graph.dimensions": ["hours"], "graph.metrics": [people] };
    }
  },
};
