import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import { parseStepLabel, pointString } from "../sql/analyses/base";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import { commonSettings } from "./common-settings";
import {
  getConversionColumnSettings,
  getSeriesSettings,
} from "./series-settings";
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
  "funnel.steps": withWidgetProps({
    getTitle: () => t`The journey you want people to complete`,
    getSection: () => "setup",
    widget: EventDefinitionListWidget,
    getDefault: () => [],
    isValid: (value) => isEventDefinitionList(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      addLabel: t`Add a step`,
      dropLabel: t`Drop a segment here to add a step`,
      minSlots: MIN_STEPS + 1,
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
        return "bar";
      case "overTime":
        return "line";
      case "timeToConvert":
        return "bar";
    }
  },
  getVizSettings: (settings) => {
    const people = grainLabel(settings.counting);
    const peopleTitle = grainTitle(settings.counting);
    switch (settings["funnel.view"]) {
      case "steps":
        return {
          "graph.dimensions": ["label"],
          "graph.metrics": [people],
          "product_analytics.funnel_steps": true,
          // The step labels are drawn by the chart, so the layout shouldn't reserve x-axis tick space
          "graph.x_axis.axis_enabled": false,
          ...getSeriesSettings(people, peopleTitle),
        };
      case "overTime":
        return {
          "graph.dimensions": ["period"],
          "graph.metrics": ["conversion"],
          ...getSeriesSettings("conversion", t`Conversion`),
          ...getConversionColumnSettings("conversion"),
        };
      case "timeToConvert":
        return {
          "graph.dimensions": ["hours"],
          "graph.metrics": [people],
          ...getSeriesSettings(people, peopleTitle),
        };
    }
  },
  describePoint: (settings, point) => {
    switch (settings["funnel.view"]) {
      case "steps": {
        const parsed = parseStepLabel(point.label);
        if (parsed === null) {
          return null;
        }
        const { step, name } = parsed;
        return step === 1
          ? t`Did step 1: ${name}`
          : t`Reached step ${step}: ${name}`;
      }
      case "overTime": {
        const period = formatPeriod(point.period, settings.granularity);
        return t`Started the funnel in ${period}`;
      }
      case "timeToConvert": {
        const hours = pointString(point.hours);
        if (hours === null) {
          return null;
        }
        const next = Number(hours) + 1;
        return t`Finished the funnel in ${hours}–${next} hours`;
      }
    }
  },
};
