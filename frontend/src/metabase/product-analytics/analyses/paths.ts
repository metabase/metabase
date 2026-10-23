import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";

import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { NumberStepperWidget } from "../components/settings/NumberStepperWidget";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Grain } from "../spec/types";
import { parseStepLabel } from "../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../sql/analyses/breakout";

import {
  type Breakout,
  getBreakoutExtraColumns,
  getBreakoutSpec,
} from "./breakout";
import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  getPageviewSpec,
  isBoolean,
  isEventDefinitionList,
  isOneOf,
  isOptionalEventDefinition,
  isPositiveInteger,
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

const getMinVolumeTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Group steps with fewer than this many people into Other`;
    case "session":
      return t`Group steps with fewer than this many sessions into Other`;
    case "event":
      return t`Group steps with fewer than this many events into Other`;
  }
};

const SETTINGS: AnalysisSettingDefinitions<PathsSettings> = {
  ...commonSettings({ granularity: null, breakout: true }),
  "paths.direction": {
    getTitle: () => t`View the path that's…`,
    getSection: () => "setup",
    widget: "radio",
    getDefault: () => "from",
    isValid: (value) => isOneOf(DIRECTIONS, value),
    getProps: () => ({
      options: [
        { name: t`after an event`, value: "from" },
        { name: t`backwards from an event`, value: "to" },
        { name: t`between two events`, value: "between" },
      ],
    }),
  },
  "paths.start": withWidgetProps({
    getTitle: () => t`The starting event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getHidden: (_context, settings) => settings["paths.direction"] === "to",
    readDependencies: ["paths.direction"],
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Start of a visit`,
    }),
  }),
  "paths.end": withWidgetProps({
    getTitle: () => t`The ending event`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getHidden: (_context, settings) => settings["paths.direction"] === "from",
    readDependencies: ["paths.direction"],
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`End of a visit`,
    }),
  }),
  "paths.steps": {
    getTitle: () => t`Number of steps to see`,
    getSection: () => "setup",
    widget: NumberStepperWidget,
    getDefault: () => 5,
    isValid: (value) => isPositiveInteger(value),
  },
  "paths.included": withWidgetProps({
    getTitle: () => t`Which kind of events count as steps?`,
    getSection: () => "advanced",
    widget: EventDefinitionListWidget,
    getDefault: () => [],
    isValid: (value) => isEventDefinitionList(value),
    getProps: getEventDefinitionProps,
  }),
  "paths.session_gap_minutes": {
    getTitle: () => t`How many minutes of inactivity results in a new visit?`,
    getSection: () => "advanced",
    widget: NumberStepperWidget,
    getDefault: () => 30,
    isValid: (value) => isPositiveInteger(value),
  },
  "paths.edge_metric": withWidgetProps({
    getTitle: () => t`What line thickness should represent`,
    getSection: () => "advanced",
    widget: SegmentedControl,
    getDefault: () => "people",
    isValid: (value) => isOneOf(EDGE_METRICS, value),
    getProps: () => ({
      data: [
        { label: t`People`, value: "people" as const },
        { label: t`Events`, value: "events" as const },
      ],
      w: "100%",
    }),
  }),
  "paths.merge_repeats": {
    getTitle: () => t`Merge repeats of the same step`,
    getSection: () => "advanced",
    inline: true,
    widget: "toggle",
    getDefault: () => true,
    isValid: (value) => isBoolean(value),
  },
  "paths.hide_noisy_events": {
    getTitle: () => t`Hide noisy events`,
    getHint: () =>
      t`Noisy events make up at least 20% of all steps and happen at least three times as often as the average event. Starting and ending events are never hidden.`,
    getSection: () => "advanced",
    inline: true,
    widget: "toggle",
    getDefault: () => false,
    isValid: (value) => isBoolean(value),
  },
  "paths.max_nodes": {
    getTitle: () => t`Number of events to show at each step`,
    getHint: () => t`The rest are grouped into Other.`,
    getSection: () => "advanced",
    widget: NumberStepperWidget,
    getDefault: () => 8,
    isValid: (value) => isPositiveInteger(value),
  },
  "paths.min_volume": {
    getTitle: (_context, settings) => getMinVolumeTitle(settings.counting),
    getSection: () => "advanced",
    widget: NumberStepperWidget,
    getDefault: () => 5,
    isValid: (value) => isPositiveInteger(value),
  },
};

const isOneCohort = (breakout: Breakout | null) =>
  breakout?.type === "cohorts" && breakout.segments.length === 1;

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
    // A hidden event keeps its value but mustn't reach the query.
    const start = direction !== "to" ? settings["paths.start"] : null;
    const end = direction !== "from" ? settings["paths.end"] : null;
    return ready({
      ...getCommonSpec("paths", settings),
      // A Sankey adds a node's flows up, so everyone would count twice, and
      // flows are crowded enough that only one cohort keeps those outside it.
      breakout: getBreakoutSpec(settings.breakout, events, {
        withEveryone: false,
        withOutside: isOneCohort(settings.breakout),
      }),
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
        hideNoisyEvents: settings["paths.hide_noisy_events"],
        maxNodes: settings["paths.max_nodes"],
        minVolume: settings["paths.min_volume"],
      },
      ...getPageviewSpec(settings, events),
      output: { pathsEdgeMetric: settings["paths.edge_metric"] },
    });
  },
  getExtraColumns: ({ breakout }, context) =>
    getBreakoutExtraColumns(breakout, context),
  // A direction that shows an empty well takes the event from the one it
  // hides, so switching from "after" to "backwards from" keeps the event.
  getFollowingChanges: (changes, settings) => {
    const direction = changes["paths.direction"];
    if (direction === undefined || direction === settings["paths.direction"]) {
      return {};
    }
    const start = settings["paths.start"];
    const end = settings["paths.end"];
    if (direction === "to" && end === null && start !== null) {
      return { "paths.end": start };
    }
    if (direction === "from" && start === null && end !== null) {
      return { "paths.start": end };
    }
    return {};
  },
  getDisplay: () => "sankey",
  getVizSettings: (settings) => ({
    "sankey.source": "source",
    "sankey.target": "target",
    "sankey.value": "weight",
    "product_analytics.paths": true,
    // A cohort's lighter shade beside its own is too subtle among flows, so
    // the groups get the chart's own colors.
    ...(settings.breakout !== null
      ? { "sankey.breakout": BREAKOUT_COLUMN }
      : {}),
  }),
  describePoint: (_settings, point) => {
    const source = parseStepLabel(point.source);
    const target = parseStepLabel(point.target);
    if (source !== null && target !== null) {
      return t`Went from ${source.name} to ${target.name} at step ${source.step}`;
    }
    const node = source ?? target;
    return node === null ? null : t`Did ${node.name} at step ${node.step}`;
  },
};
