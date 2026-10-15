import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import type { EventDefinition } from "../events/types";
import { findColumn } from "../find-column";
import { withWidgetProps } from "../settings/with-widget-props";
import { grainLabel } from "../sql/compile/grain";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isBoolean,
  isEventDefinitionList,
  isOneOf,
  isPositiveDuration,
  ready,
} from "./setting-helpers";
import {
  type StepCandidate,
  type SuggestedStep,
  suggestFunnelSteps,
} from "./suggest-funnel-steps";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  FunnelSettings,
  SuggestionContext,
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
  "funnel.steps": withWidgetProps({
    getTitle: () => t`The journey you want people to complete`,
    getSection: () => "setup",
    widget: EventDefinitionListWidget,
    getDefault: () => [],
    isValid: (value) => isEventDefinitionList(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      addLabel: t`Add a step`,
    }),
  }),
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
    widget: "radio",
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
    inline: true,
    widget: "toggle",
    getDefault: () => false,
    isValid: (value) => isBoolean(value),
  },
};

const STAGE_INDEX = -1;

/**
 * Turns a suggested step into an event definition: a segment becomes a
 * segment filter, a value becomes an equality filter on its role's column.
 * `null` when the table can't express it, e.g. the segment is gone.
 */
const toEventDefinition = (
  { tableQuery, table }: SuggestionContext,
  columnByRole: Partial<Record<"event_name" | "url_path", string | null>>,
  step: SuggestedStep,
): EventDefinition | null => {
  const filter = (() => {
    if (step.source === "segment") {
      const segment = table.segments?.find(({ name }) => name === step.value);
      return segment ? Lib.segmentMetadata(tableQuery, segment.id) : null;
    }
    const columnName = columnByRole[step.source];
    if (!columnName) {
      return null;
    }
    try {
      return Lib.stringFilterClause({
        operator: "=",
        column: findColumn(tableQuery, columnName),
        values: [step.value],
        options: {},
      });
    } catch {
      return null;
    }
  })();
  return filter
    ? {
        name: step.name,
        query: Lib.toJsQuery(Lib.filter(tableQuery, STAGE_INDEX, filter)),
      }
    : null;
};

const getSuggestedSettings = (
  context: SuggestionContext,
  settings: FunnelSettings,
): Partial<FunnelSettings> | undefined => {
  const candidates: StepCandidate[] = [
    ...(context.table.segments ?? [])
      .filter((segment) => !segment.archived)
      .map(({ name }) => ({ source: "segment" as const, value: name })),
    ...(context.valuesByRole.event_name ?? []).map((value) => ({
      source: "event_name" as const,
      value,
    })),
    ...(context.valuesByRole.url_path ?? []).map((value) => ({
      source: "url_path" as const,
      value,
    })),
  ];
  const steps = suggestFunnelSteps(candidates)
    .map((step) =>
      toEventDefinition(
        context,
        {
          event_name: settings["columns.event_name"],
          url_path: settings["columns.url_path"],
        },
        step,
      ),
    )
    .filter((step) => step !== null);
  return steps.length >= MIN_STEPS ? { "funnel.steps": steps } : undefined;
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
  getSuggestedSettings,
  toSpec: (settings, events) => {
    const steps = settings["funnel.steps"];
    if (steps.length < MIN_STEPS) {
      return incomplete([
        {
          key: "funnel.steps",
          message: t`Add at least ${MIN_STEPS} steps.`,
        },
      ]);
    }
    return ready({
      ...getCommonSpec("funnel", settings),
      funnel: {
        steps: steps.map((event, index) => ({
          index,
          flag: events.flagFor(event),
          label: event.name,
        })),
        exclusions: [],
        window: settings["funnel.window"],
        anchor: settings["funnel.anchor"],
        ordering: settings["funnel.ordering"],
        allowRetry: settings["funnel.allow_retry"],
      },
      output: { funnelView: settings["funnel.view"] },
    });
  },
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
