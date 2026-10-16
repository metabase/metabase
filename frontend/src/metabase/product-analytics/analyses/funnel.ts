import { c, t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import { color } from "metabase/ui/colors";
import type { VisualizationSettings } from "metabase-types/api";

import { BreakdownWidget } from "../components/settings/BreakdownWidget";
import { DurationWidget } from "../components/settings/DurationWidget";
import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import { getSegmentConversionVizSettings } from "../insights/explore";
import { withWidgetProps } from "../settings/with-widget-props";
import { grainLabel, grainTitle } from "../sql/compile/grain";

import {
  BREAKDOWN_SEGMENT_COLUMN,
  getBreakdownAttribute,
  getBreakdownExtraColumns,
  getBreakdownLabel,
  getBreakdownOptions,
  isBreakdownColumnList,
} from "./breakdown";
import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isBoolean,
  isEventDefinitionList,
  isOneOf,
  isPositiveDuration,
  isPositiveInteger,
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

const SERIES_COLOR_NAME = "accent0";

const isBreakdownShown = (settings: FunnelSettings): boolean =>
  settings["funnel.view"] === "steps" &&
  settings["funnel.breakdown"].length > 0;

// Every view shares one color. The color name keeps it following the active palette.
const getSeriesSettings = (
  metric: string,
  title: string,
): Pick<VisualizationSettings, "series_settings"> => ({
  series_settings: {
    [metric]: {
      title,
      color: color(SERIES_COLOR_NAME),
      color_name: SERIES_COLOR_NAME,
    },
  },
});

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
  "funnel.breakdown": withWidgetProps({
    getTitle: () => t`Break down by`,
    getHint: () =>
      t`Shows how many people reached a step, and how many of them went on to the next, for each value.`,
    getSection: () => "setup",
    secondary: true,
    widget: BreakdownWidget,
    getDefault: () => [],
    isValid: (value, context) => isBreakdownColumnList(value, context),
    getHidden: (_context, settings) => settings["funnel.view"] !== "steps",
    getProps: (context) => ({ options: getBreakdownOptions(context) }),
  }),
  "funnel.breakdown_step": {
    getTitle: () => t`At which step`,
    getSection: () => "setup",
    secondary: true,
    widget: "select",
    getDefault: () => 1,
    isValid: (value, _context, settings) =>
      isPositiveInteger(value) &&
      value < (settings["funnel.steps"]?.length ?? 0),
    getHidden: (_context, settings) => !isBreakdownShown(settings),
    getProps: (_context, settings) => ({
      options: settings["funnel.steps"].slice(0, -1).map((step, index) => ({
        name: c("{0} and {1} are funnel step names")
          .t`${step.name} → ${settings["funnel.steps"][index + 1].name}`,
        value: index + 1,
      })),
    }),
    readDependencies: ["funnel.steps"],
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
        breakdown: isBreakdownShown(settings)
          ? {
              transition: settings["funnel.breakdown_step"],
              attributes: settings["funnel.breakdown"].map((_, index) =>
                getBreakdownAttribute(index),
              ),
            }
          : undefined,
      },
      output: { funnelView: settings["funnel.view"] },
    });
  },
  getExtraColumns: (settings) =>
    isBreakdownShown(settings)
      ? getBreakdownExtraColumns(settings["funnel.breakdown"])
      : [],
  getDisplay: (settings) => {
    if (isBreakdownShown(settings)) {
      return "combo";
    }
    switch (settings["funnel.view"]) {
      case "steps":
        return "bar";
      case "overTime":
        return "line";
      case "timeToConvert":
        return "bar";
    }
  },
  getVizSettings: (settings, context) => {
    if (isBreakdownShown(settings)) {
      return {
        ...getSegmentConversionVizSettings(BREAKDOWN_SEGMENT_COLUMN),
        "graph.x_axis.title_text": getBreakdownLabel(
          settings["funnel.breakdown"],
          context,
        ),
      };
    }
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
        };
      case "timeToConvert":
        return {
          "graph.dimensions": ["hours"],
          "graph.metrics": [people],
          ...getSeriesSettings(people, peopleTitle),
        };
    }
  },
};
