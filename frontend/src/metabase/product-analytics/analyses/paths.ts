import { t } from "ttag";

import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { withWidgetProps } from "../settings/with-widget-props";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isBoolean,
  isEventDefinitionList,
  isOneOf,
  isOptionalEventDefinition,
  isPositiveInteger,
  missingIf,
  ready,
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
  "paths.start": withWidgetProps({
    getTitle: () => t`Starting event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getHidden: (_context, settings) => settings["paths.direction"] === "to",
    readDependencies: ["paths.direction"],
    getProps: getEventDefinitionProps,
  }),
  "paths.end": withWidgetProps({
    getTitle: () => t`Ending event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getHidden: (_context, settings) => settings["paths.direction"] === "from",
    readDependencies: ["paths.direction"],
    getProps: getEventDefinitionProps,
  }),
  "paths.steps": {
    getTitle: () => t`Steps to show`,
    getSection: () => "setup",
    widget: "number",
    getDefault: () => 4,
    isValid: (value) => isPositiveInteger(value),
    getProps: () => INTEGER_PROPS,
  },
  "paths.included": withWidgetProps({
    getTitle: () => t`Events to include`,
    getSection: () => "setup",
    widget: EventDefinitionListWidget,
    getDefault: () => [],
    isValid: (value) => isEventDefinitionList(value),
    getProps: getEventDefinitionProps,
  }),
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
  toSpec: (settings, events) => {
    const direction = settings["paths.direction"];
    const usesStart = direction !== "to";
    const usesEnd = direction !== "from";
    // A hidden event keeps its value but mustn't reach the query.
    const start = usesStart ? settings["paths.start"] : null;
    const end = usesEnd ? settings["paths.end"] : null;
    const isMissingStart = usesStart && start === null;
    const isMissingEnd = usesEnd && end === null;
    if (isMissingStart || isMissingEnd) {
      return incomplete([
        ...missingIf(isMissingStart, {
          key: "paths.start",
          message: t`Define a starting event.`,
        }),
        ...missingIf(isMissingEnd, {
          key: "paths.end",
          message: t`Define an ending event.`,
        }),
      ]);
    }
    return ready({
      ...getCommonSpec("paths", settings),
      paths: {
        direction,
        start: start !== null ? { flag: events.flagFor(start) } : null,
        end: end !== null ? { flag: events.flagFor(end) } : null,
        steps: settings["paths.steps"],
        included: settings["paths.included"].map((event) => ({
          flag: events.flagFor(event),
        })),
        sessionGapMinutes: settings["paths.session_gap_minutes"],
        mergeRepeats: settings["paths.merge_repeats"],
        collapseNoise: settings["paths.collapse_noise"],
        maxNodes: settings["paths.max_nodes"],
        minVolume: settings["paths.min_volume"],
      },
      output: { pathsEdgeMetric: settings["paths.edge_metric"] },
    });
  },
  getDisplay: () => "sankey",
  getVizSettings: () => ({
    "sankey.source": "source",
    "sankey.target": "target",
    "sankey.value": "weight",
  }),
};
