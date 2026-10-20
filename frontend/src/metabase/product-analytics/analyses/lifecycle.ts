import { t } from "ttag";

import * as Lib from "metabase-lib";

import { CheckboxCardsWidget } from "../components/settings/CheckboxCardsWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { formatPeriod } from "../drills/describe";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Granularity, LifecycleStateName, Period } from "../spec/types";
import { pointString } from "../sql/analyses/base";
import { grainTitle } from "../sql/compile/grain";

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
  LifecycleSettings,
} from "./types";

const STATES: readonly LifecycleStateName[] = [
  "new",
  "returning",
  "resurrected",
  "dormant",
];

export const getStateName = (state: LifecycleStateName): string => {
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

const SETTINGS: AnalysisSettingDefinitions<LifecycleSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
  }),
  "lifecycle.active": withWidgetProps({
    getTitle: () => t`What action counts as being active?`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({
      ...getEventDefinitionProps(context),
      emptyLabel: t`Any action or event`,
    }),
  }),
  "lifecycle.shown": withWidgetProps({
    getTitle: () => t`Groups to show`,
    getSection: () => "setup",
    widget: CheckboxCardsWidget<LifecycleStateName>,
    getDefault: () => [...STATES],
    isValid: (value) =>
      isUnknownArray(value) && value.every((state) => isOneOf(STATES, state)),
    getProps: (_context, settings) => ({
      options: STATES.map((state) => ({
        value: state,
        label: getStateName(state),
        description: getStateDescription(
          state,
          getPeriod(settings.granularity),
        ),
      })),
    }),
  }),
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
      lifecycle: {
        // Empty means any event counts as being active.
        active: active === null ? undefined : { flag: events.flagFor(active) },
        period: getPeriod(settings.granularity),
      },
      output: { lifecycleShown: settings["lifecycle.shown"] },
    });
  },
  getDisplay: () => "bar",
  getVizSettings: (settings) => ({
    "graph.dimensions": ["period", "state"],
    "graph.metrics": ["actors"],
    "stackable.stack_type": "stacked",
    series_settings: Object.fromEntries(
      STATES.map((state) => [state, { title: getStateName(state) }]),
    ),
    ...getAxisTitleSettings({
      x: Lib.describeTemporalUnit(settings.granularity),
      y: grainTitle(settings.counting),
    }),
  }),
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
