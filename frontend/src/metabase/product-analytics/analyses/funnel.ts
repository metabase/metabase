import { t } from "ttag";

import { SegmentedControl } from "metabase/ui";
import { color } from "metabase/ui/colors";
import type { ColorName } from "metabase/ui/colors/types";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { DurationWidget } from "../components/settings/DurationWidget";
import { EventDefinitionListWidget } from "../components/settings/EventDefinitionListWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import { parseStepLabel, pointString } from "../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../sql/analyses/breakout";
import { TIME_TO_CONVERT_COLUMN } from "../sql/analyses/funnel";
import { grainLabel, grainTitle } from "../sql/compile/grain";
import { DROPPED_OFF_POINT_KEY } from "../sql/compose";

import {
  getBreakoutExtraColumns,
  getBreakoutSeriesSettings,
  getBreakoutSpec,
  getStackedGroupsSettings,
} from "./breakout";
import { commonSettings } from "./common-settings";
import {
  SERIES_COLOR_KEY,
  getAxisTitleSettings,
  getConversionColumnSettings,
  getSeriesColorSlot,
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
  ColorSlot,
  DisplayColors,
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

// Over time draws a line per step, so they start in different colors.
const LINE_COLOR_NAMES: readonly ColorName[] = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
];

const getStepColorKey = (index: number): string => `step.${index}`;

/**
 * A step's picked color, shared by the views that draw steps. Step by step
 * defaults every bar to the brand color; over time, each line to its own.
 */
const getStepColor = (
  view: FunnelSettings["funnel.view"],
  index: number,
  colors: DisplayColors,
): string =>
  colors[getStepColorKey(index)] ??
  (view === "overTime"
    ? color(LINE_COLOR_NAMES[index % LINE_COLOR_NAMES.length])
    : color("core-brand"));

// Keep in sync with the planner's step labels, which `parseStepLabel` reads.
const getStepLabel = (index: number, name: string): string =>
  `${index + 1}. ${name}`;

// Hourly starts are noise next to a completion window that's usually days.
const { breakout_view: breakoutView, ...common } = commonSettings({
  granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
  breakout: true,
  canPivot: true,
  grains: ["person", "session"],
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
      minSlots: MIN_STEPS,
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
  // Last in setup, under the steps and view it shows. Over time's line per
  // group already reads like a table's columns.
  breakout_view: {
    ...breakoutView,
    getHidden: (context, settings) =>
      settings["funnel.view"] === "overTime" ||
      (breakoutView.getHidden?.(context, settings) ?? false),
    readDependencies: ["breakout", "funnel.view"],
  },
};

/**
 * Over time broken out: a line per group of how many got to the last step,
 * since a line per step per group would be too many.
 */
const getOverTimeByGroupSettings = (
  settings: FunnelSettings,
): VisualizationSettings => ({
  "graph.dimensions": ["period", BREAKOUT_COLUMN],
  "graph.metrics": ["conversion"],
  ...getBreakoutSeriesSettings(settings.breakout),
  ...getConversionColumnSettings("conversion"),
  ...getAxisTitleSettings({
    x: Lib.describeTemporalUnit(settings.granularity),
    y: t`Conversion`,
  }),
});

/**
 * The bars broken out: a chart per group, each a whole funnel, or with
 * "Stack series" off, the groups side by side. The step chart's labels and
 * ghost bars draw one series, so side by side, steps are plain bars that
 * keep the steps' tooltip.
 */
const getBarsByGroupSettings = (
  settings: FunnelSettings,
): VisualizationSettings => {
  const people = grainLabel(settings.counting);
  const peopleTitle = grainTitle(settings.counting);
  const groupSettings = getBreakoutSeriesSettings(settings.breakout);
  return settings["funnel.view"] === "timeToConvert"
    ? {
        "graph.dimensions": [TIME_TO_CONVERT_COLUMN, BREAKOUT_COLUMN],
        "graph.metrics": [people],
        ...getStackedGroupsSettings(),
        ...groupSettings,
        ...getAxisTitleSettings({ x: t`Time to finish`, y: peopleTitle }),
      }
    : {
        "graph.dimensions": ["label", BREAKOUT_COLUMN],
        "graph.metrics": [people],
        "product_analytics.funnel_steps": true,
        // The step names say what the axis is.
        "graph.x_axis.labels_enabled": false,
        ...getStackedGroupsSettings(),
        ...groupSettings,
        ...getAxisTitleSettings({ y: peopleTitle }),
      };
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
      breakout: getBreakoutSpec(settings.breakout, events),
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
  getExtraColumns: ({ breakout }, context) =>
    getBreakoutExtraColumns(breakout, context),
  getDisplay: (settings) => {
    switch (settings["funnel.view"]) {
      case "overTime":
        return "line";
      case "steps":
      case "timeToConvert":
        return "bar";
    }
  },
  getVizSettings: (settings, colors) => {
    if (settings.breakout !== null) {
      return settings["funnel.view"] === "overTime"
        ? getOverTimeByGroupSettings(settings)
        : getBarsByGroupSettings(settings);
    }
    const people = grainLabel(settings.counting);
    const peopleTitle = grainTitle(settings.counting);
    const view = settings["funnel.view"];
    const steps = settings["funnel.steps"];
    switch (view) {
      case "steps":
        return {
          "graph.dimensions": ["label"],
          "graph.metrics": [people],
          "product_analytics.funnel_steps": true,
          "product_analytics.funnel_step_colors": steps.map((_step, index) =>
            getStepColor(view, index, colors),
          ),
          ...getSeriesSettings(people, peopleTitle),
          ...getAxisTitleSettings({ y: peopleTitle }),
        };
      case "overTime":
        return {
          "graph.dimensions": ["period", "label"],
          "graph.metrics": ["conversion"],
          // One line per step after the first, keyed by its label.
          series_settings: Object.fromEntries(
            steps
              .map((step, index) => [
                getStepLabel(index, step.name),
                { color: getStepColor(view, index, colors) },
              ])
              .slice(1),
          ),
          ...getConversionColumnSettings("conversion"),
          ...getAxisTitleSettings({
            x: Lib.describeTemporalUnit(settings.granularity),
            y: t`Conversion`,
          }),
        };
      case "timeToConvert":
        return {
          "graph.dimensions": [TIME_TO_CONVERT_COLUMN],
          "graph.metrics": [people],
          ...getSeriesSettings(people, peopleTitle, colors[SERIES_COLOR_KEY]),
          ...getAxisTitleSettings({ x: t`Time to finish`, y: peopleTitle }),
        };
    }
  },
  getColorSlots: (settings, colors) => {
    const view = settings["funnel.view"];
    // Broken out, the groups have the colors.
    if (settings.breakout !== null) {
      return [];
    }
    if (view === "timeToConvert") {
      return [getSeriesColorSlot(colors)];
    }
    const slots: ColorSlot[] = settings["funnel.steps"].map((step, index) => ({
      key: getStepColorKey(index),
      label: getStepLabel(index, step.name),
      color: getStepColor(view, index, colors),
    }));
    // Over time has no line for the first step.
    return view === "overTime" ? slots.slice(1) : slots;
  },
  describePoint: (settings, point) => {
    switch (settings["funnel.view"]) {
      case "steps": {
        const parsed = parseStepLabel(point.label);
        if (parsed === null) {
          return null;
        }
        const { step, name } = parsed;
        if (point[DROPPED_OFF_POINT_KEY] === true && step > 1) {
          return t`Dropped off before step ${step}: ${name}`;
        }
        return step === 1
          ? t`Did step 1: ${name}`
          : t`Reached step ${step}: ${name}`;
      }
      case "overTime": {
        const period = formatPeriod(point.period, settings.granularity);
        const parsed = parseStepLabel(point.label);
        return parsed === null
          ? t`Started the funnel in ${period}`
          : t`Started the funnel in ${period} and reached step ${parsed.step}: ${parsed.name}`;
      }
      case "timeToConvert": {
        const duration = pointString(point[TIME_TO_CONVERT_COLUMN]);
        return duration === null
          ? null
          : t`Took ${duration} to finish the funnel`;
      }
    }
  },
};
