import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventListWidget } from "../components/settings/EventListWidget";
import { withWidgetProps } from "../settings/with-widget-props";
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
    getTitle: () => t`The journey you want people to complete`,
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
  "funnel.view": withWidgetProps({
    getTitle: () => t`How to display the funnel`,
    getSection: () => "setup",
    widget: SegmentedControl,
    getDefault: () => "steps",
    isValid: (value) => isOneOf(VIEWS, value),
    getProps: () => ({
      data: [
        { label: t`Step by step`, value: "steps" as const },
        { label: t`Over time`, value: "overTime" as const },
        { label: t`How long it took`, value: "timeToConvert" as const },
      ],
      w: "100%",
    }),
  }),
  "funnel.window": {
    getTitle: () => t`How long does someone get to finish the steps?`,
    getSection: () => "advanced",
    widget: DurationWidget,
    getDefault: () => ({ value: 7, unit: "day" }),
    isValid: (value) => isPositiveDuration(value),
  },
  "funnel.anchor": {
    getSection: () => "advanced",
    widget: "segmentedControl",
    getDefault: () => "first",
    isValid: (value) => isOneOf(ANCHORS, value),
    getProps: () => ({
      options: [
        { name: t`Counted from their first step`, value: "first" },
        { name: t`Counted from the last step they completed`, value: "each" },
      ],
    }),
  },
  "funnel.ordering": {
    getTitle: () => t`How strictly in order do they need to do each step?`,
    getSection: () => "advanced",
    widget: "select",
    getDefault: () => "loose",
    isValid: (value) => isOneOf(ORDERINGS, value),
    getProps: () => ({
      options: [
        { name: t`In order, no other actions in between`, value: "strict" },
        { name: t`In order, other actions allowed in between`, value: "loose" },
        { name: t`In any order`, value: "any" },
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
