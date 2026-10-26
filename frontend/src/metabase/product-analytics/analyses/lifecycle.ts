import { t } from "ttag";

import { color } from "metabase/ui/colors";
import type { ColorName } from "metabase/ui/colors/types";
import * as Lib from "metabase-lib";

import { FIRST_SEEN_COLUMN } from "../columns";
import { CheckboxCardsWidget } from "../components/settings/CheckboxCardsWidget";
import { ColumnPickerWidget } from "../components/settings/ColumnPickerWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, LifecycleStateName, Period } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import {
  FIRST_SEEN_EXTRA_COLUMN,
  LIFECYCLE_VALUE_COLUMN,
} from "../sql/analyses/lifecycle";
import { grainTitle } from "../sql/compile/grain";

import {
  getBreakoutExtraColumns,
  getBreakoutSpec,
  getChartPerGroupSettings,
} from "./breakout";
import { getDateColumnOptions, isDateColumnInTable } from "./column-roles";
import { commonSettings } from "./common-settings";
import { getAxisTitleSettings } from "./series-settings";
import {
  getCommonSpec,
  getEventDefinitionProps,
  incomplete,
  isOneOf,
  isOptionalEventDefinition,
  isUnknownArray,
  ready,
} from "./setting-helpers";
import type {
  AnalysisConfig,
  AnalysisSettingDefinitions,
  DisplayColors,
  LifecycleSettings,
} from "./types";

const STATES: readonly LifecycleStateName[] = [
  "new",
  "returning",
  "resurrected",
  "dormant",
];

const STATE_COLOR_NAMES: Record<LifecycleStateName, ColorName> = {
  new: "accent0",
  returning: "accent2",
  resurrected: "accent4",
  dormant: "accent3",
};

const getStateColorKey = (state: LifecycleStateName): string =>
  `state.${state}`;

/** The state's picked color, else its palette color. */
const getStateColor = (
  state: LifecycleStateName,
  colors: DisplayColors,
): string => colors[getStateColorKey(state)] ?? color(STATE_COLOR_NAMES[state]);

const getStateName = (state: LifecycleStateName): string => {
  switch (state) {
    case "new":
      return t`New`;
    case "returning":
      return t`Returning`;
    case "resurrected":
      return t`Came back`;
    case "dormant":
      return t`Went quiet`;
  }
};

const getStateDescription = (
  state: LifecycleStateName,
  period: Period,
): string => {
  switch (period) {
    case "day":
      return {
        new: t`Active in a given day, and never before.`,
        returning: t`Active in a given day and the previous day.`,
        resurrected: t`Active in the past, but not the previous day.`,
        dormant: t`Inactive one day, but active the day before.`,
      }[state];
    case "week":
      return {
        new: t`Active in a given week, and never before.`,
        returning: t`Active in a given week and the previous week.`,
        resurrected: t`Active in the past, but not the previous week.`,
        dormant: t`Inactive one week, but active the week before.`,
      }[state];
    case "month":
      return {
        new: t`Active in a given month, and never before.`,
        returning: t`Active in a given month and the previous month.`,
        resurrected: t`Active in the past, but not the previous month.`,
        dormant: t`Inactive one month, but active the month before.`,
      }[state];
  }
};

// granularity's units exclude "hour" here; isValid enforces it.
const getPeriod = (granularity: Granularity): Period =>
  granularity === "hour" ? "day" : granularity;

const { breakout_view: breakoutView, ...common } = commonSettings({
  granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
  breakout: true,
  canPivot: true,
  grains: ["person", "session", "event"],
});

const SETTINGS: AnalysisSettingDefinitions<LifecycleSettings> = {
  ...common,
  "lifecycle.active": withWidgetProps({
    getTitle: () => t`What action counts as being active?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any event`,
    }),
  }),
  "lifecycle.first_seen_column": withWidgetProps({
    getTitle: () => t`When each person was first seen`,
    getHint: () =>
      t`People are new in the period they were first seen. Without this column, they're new in the first period they're active in the date range, even if they were active before it.`,
    getSection: () => "setup",
    secondary: true,
    widget: ColumnPickerWidget,
    getDefault: (context) =>
      isDateColumnInTable(context.table, FIRST_SEEN_COLUMN)
        ? FIRST_SEEN_COLUMN
        : null,
    isValid: (value, context) =>
      value === null || isDateColumnInTable(context.table, value),
    // this is hidden like the column role settings - should maybe be configured one time per table rather than per analysis
    getHidden: () => true,
    getProps: (context) => ({
      columns: getDateColumnOptions(context.table),
      isRequired: false,
    }),
  }),
  "lifecycle.shown": withWidgetProps({
    getTitle: () => t`Groups to show`,
    getSection: () => "setup",
    widget: CheckboxCardsWidget<LifecycleStateName>,
    getDefault: () => [...STATES],
    isValid: (value) =>
      isUnknownArray(value) && value.every((state) => isOneOf(STATES, state)),
    getProps: (context, settings) => ({
      options: STATES.map((state) => ({
        value: state,
        label: getStateName(state),
        // The chart's color for the group, picked or from the palette.
        color:
          context.displayColors?.[getStateColorKey(state)] ??
          STATE_COLOR_NAMES[state],
        description: getStateDescription(
          state,
          getPeriod(settings.granularity),
        ),
      })),
    }),
  }),
  // Last in setup, under what it shows.
  breakout_view: breakoutView,
};

export const LIFECYCLE_CONFIG: AnalysisConfig<"lifecycle"> = {
  kind: "lifecycle",
  get name() {
    return t`Lifecycle`;
  },
  get question() {
    return t`Is the base growing or shrinking?`;
  },
  get setupLabel() {
    return t`Setup`;
  },
  settings: SETTINGS,
  toSpec: (settings, events) => {
    const active = settings["lifecycle.active"];
    if (settings["lifecycle.shown"].length === 0) {
      return incomplete([
        {
          key: "lifecycle.shown",
          message: t`Pick at least one group to show.`,
        },
      ]);
    }
    return ready({
      ...getCommonSpec("lifecycle", settings),
      // Only people come back, so counting picks what the bars add up.
      grain: "person",
      breakout: getBreakoutSpec(settings.breakout, events),
      lifecycle: {
        // Empty means any event counts as being active.
        active: active === null ? undefined : { flag: events.flagFor(active) },
        period: getPeriod(settings.granularity),
        hasFirstSeen: settings["lifecycle.first_seen_column"] !== null,
        counted: settings.counting,
      },
      output: { lifecycleShown: settings["lifecycle.shown"] },
    });
  },
  getExtraColumns: (settings, context) => {
    const column = settings["lifecycle.first_seen_column"];
    return [
      ...(column !== null
        ? [{ as: FIRST_SEEN_EXTRA_COLUMN, column, from: "events" as const }]
        : []),
      ...getBreakoutExtraColumns(settings.breakout, context),
    ];
  },
  getDisplay: () => "bar",
  getVizSettings: (settings, colors) => ({
    // The states already stack, so each group gets a chart of its own.
    ...(settings.breakout !== null ? getChartPerGroupSettings() : {}),
    "graph.dimensions": ["period", "state"],
    "graph.metrics": [LIFECYCLE_VALUE_COLUMN],
    "stackable.stack_type": "stacked",
    // Went quiet isn't part of the week's active count, so totals invite the wrong sum.
    "graph.tooltip_show_stack_totals": false,
    series_settings: Object.fromEntries(
      STATES.map((state) => [
        state,
        {
          title: getStateName(state),
          color: getStateColor(state, colors),
          // A picked color has no palette name to follow.
          ...(colors[getStateColorKey(state)] === undefined
            ? { color_name: STATE_COLOR_NAMES[state] }
            : {}),
        },
      ]),
    ),
    "graph.series_order_dimension": "state",
    "graph.series_order": STATES.map((state) => ({
      key: state,
      name: getStateName(state),
      enabled: true,
      color: getStateColor(state, colors),
    })),
    ...getAxisTitleSettings({
      x: Lib.describeTemporalUnit(settings.granularity),
      y: grainTitle(settings.counting),
    }),
  }),
  getColorSlots: (_settings, colors) =>
    STATES.map((state) => ({
      key: getStateColorKey(state),
      label: getStateName(state),
      color: getStateColor(state, colors),
    })),
  describePoint: (settings, point) => {
    const state = STATES.find((item) => item === pointString(point.state));
    if (state === undefined) {
      return null;
    }
    const name = getStateName(state);
    const period = formatPeriod(point.period, settings.granularity);
    return t`${name} in ${period}`;
  },
};
