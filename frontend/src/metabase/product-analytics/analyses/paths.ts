import { t } from "ttag";

import { EventListWidget } from "../components/settings/EventListWidget";
import { EventPickerWidget } from "../components/settings/EventPickerWidget";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventPickerProps,
  isBoolean,
  isOneOf,
  isPositiveInteger,
  isValidEvent,
  isValidEventList,
  savedEvent,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  PathsSettings,
} from "./types";

const DIRECTIONS: readonly PathsSettings["paths.direction"][] = [
  "from",
  "to",
  "between",
];
const EDGE_METRICS: readonly PathsSettings["paths.edge_metric"][] = [
  "people",
  "events",
];
const INTEGER_PROPS = { options: { isInteger: true, isNonNegative: true } };

const SETTINGS: AnalysisSettingDefinitions<PathsSettings> = {
  ...commonSettings({ granularity: null }),
  "paths.direction": {
    getTitle: () => t`Paths`,
    getSection: () => "setup",
    widget: "segmentedControl",
    getDefault: () => "from",
    isValid: (value) => isOneOf(DIRECTIONS, value),
    getProps: () => ({
      options: [
        { name: t`From`, value: "from" },
        { name: t`To`, value: "to" },
        { name: t`Between`, value: "between" },
      ],
    }),
  },
  "paths.start": {
    getTitle: () => t`Starting event`,
    getSection: () => "setup",
    widget: EventPickerWidget,
    getDefault: () => savedEvent("pricing"),
    isValid: (value, context) => isValidEvent(context, value),
    getHidden: (_context, settings) => settings["paths.direction"] === "to",
    getProps: getEventPickerProps,
    readDependencies: ["paths.direction"],
  },
  "paths.end": {
    getTitle: () => t`Ending event`,
    getSection: () => "setup",
    widget: EventPickerWidget,
    getDefault: () => savedEvent("checkout"),
    isValid: (value, context) => isValidEvent(context, value),
    getHidden: (_context, settings) => settings["paths.direction"] === "from",
    getProps: getEventPickerProps,
    readDependencies: ["paths.direction"],
  },
  "paths.steps": {
    getTitle: () => t`Steps to show`,
    getSection: () => "setup",
    widget: "number",
    getDefault: () => 4,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
  },
  "paths.included": {
    getTitle: () => t`Events to include`,
    getSection: () => "setup",
    widget: EventListWidget,
    getDefault: () =>
      [
        "pricing",
        "signup",
        "trial",
        "active",
        "invite",
        "report",
        "checkout",
      ].map(savedEvent),
    isValid: (value, context) => isValidEventList(context, value),
    getProps: getEventPickerProps,
  },
  "paths.session_gap_minutes": {
    getTitle: () => t`New visit after (minutes idle)`,
    getSection: () => "advanced",
    widget: "number",
    getDefault: () => 30,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
  },
  "paths.merge_repeats": {
    getTitle: () => t`Merge repeated steps`,
    getSection: () => "advanced",
    widget: "toggle",
    getDefault: () => true,
    isValid: (value) => isBoolean(value),
  },
  "paths.collapse_noise": {
    getTitle: () => t`Collapse noise`,
    getSection: () => "advanced",
    widget: "toggle",
    getDefault: () => true,
    isValid: (value) => isBoolean(value),
  },
  "paths.max_nodes": {
    getTitle: () => t`Most steps per hop`,
    getSection: () => "advanced",
    widget: "number",
    getDefault: () => 8,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
  },
  "paths.min_volume": {
    getTitle: () => t`Hide paths with fewer than`,
    getSection: () => "advanced",
    widget: "number",
    getDefault: () => 5,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
  },
  "paths.edge_metric": {
    getTitle: () => t`Count`,
    getSection: () => "advanced",
    widget: "segmentedControl",
    getDefault: () => "people",
    isValid: (value) => isOneOf(EDGE_METRICS, value),
    getProps: () => ({
      options: [
        { name: t`People`, value: "people" },
        { name: t`Events`, value: "events" },
      ],
    }),
  },
};

export const PATHS_CONFIG: AnalysisConfig<"paths"> = {
  kind: "paths",
  get name() {
    return t`Paths`;
  },
  get question() {
    return t`What steps did people take?`;
  },
  get setupLabel() {
    return t`Setup`;
  },
  settings: SETTINGS,
  getEventRefs: (settings) => [
    settings["paths.start"],
    settings["paths.end"],
    ...settings["paths.included"],
  ],
  toSpec: (settings, events) => ({
    ...getCommonSpec("paths", settings),
    paths: {
      direction: settings["paths.direction"],
      start: { flag: events.flagFor(settings["paths.start"]) },
      end: { flag: events.flagFor(settings["paths.end"]) },
      steps: settings["paths.steps"],
      included: settings["paths.included"].map((ref) => ({
        flag: events.flagFor(ref),
      })),
      sessionGapMinutes: settings["paths.session_gap_minutes"],
      mergeRepeats: settings["paths.merge_repeats"],
      collapseNoise: settings["paths.collapse_noise"],
      maxNodes: settings["paths.max_nodes"],
      minVolume: settings["paths.min_volume"],
    },
    output: { pathsEdgeMetric: settings["paths.edge_metric"] },
  }),
  getDisplay: () => "sankey",
  getVizSettings: () => ({
    "sankey.source": "source",
    "sankey.target": "target",
    "sankey.value": "weight",
  }),
};
