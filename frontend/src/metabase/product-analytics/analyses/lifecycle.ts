import { t } from "ttag";

import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { withWidgetProps } from "../settings/with-widget-props";
import type { LifecycleStateName } from "../spec/types";

import { commonSettings } from "./common-settings";
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

const getStateName = (state: LifecycleStateName): string => {
  switch (state) {
    case "new":
      return t`New`;
    case "returning":
      return t`Returning`;
    case "resurrected":
      return t`Resurrected`;
    case "dormant":
      return t`Dormant`;
  }
};

const SETTINGS: AnalysisSettingDefinitions<LifecycleSettings> = {
  ...commonSettings({
    granularity: { units: ["day", "week", "month"], defaultUnit: "week" },
  }),
  "lifecycle.active": withWidgetProps({
    getTitle: () => t`Active means`,
    getSection: () => "setup",
    widget: EventDefinitionWidget,
    getDefault: () => null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: getEventDefinitionProps,
  }),
  "lifecycle.shown": {
    getTitle: () => t`States to show`,
    getSection: () => "advanced",
    widget: "multiselect",
    getDefault: () => [...STATES],
    isValid: (value) =>
      isUnknownArray(value) &&
      value.length > 0 &&
      value.every((state) => isOneOf(STATES, state)),
    getProps: () => ({
      options: STATES.map((state) => ({
        value: state,
        label: getStateName(state),
      })),
      placeholder: t`Pick states`,
      placeholderNoOptions: t`No states`,
    }),
  },
};

export const LIFECYCLE_CONFIG: AnalysisConfig<"lifecycle"> = {
  kind: "lifecycle",
  get name() {
    return t`Lifecycle`;
  },
  get question() {
    return t`Is the base growing or leaking?`;
  },
  get setupLabel() {
    return t`Setup`;
  },
  settings: SETTINGS,
  toSpec: (settings, events) => {
    const active = settings["lifecycle.active"];
    if (active === null) {
      return incomplete([
        {
          key: "lifecycle.active",
          message: t`Define the event that counts as being active.`,
        },
      ]);
    }
    return ready({
      ...getCommonSpec("lifecycle", settings),
      lifecycle: {
        active: { flag: events.flagFor(active) },
        // granularity's units exclude "hour" here; isValid enforces it.
        period: settings.granularity === "hour" ? "day" : settings.granularity,
      },
      output: { lifecycleShown: settings["lifecycle.shown"] },
    });
  },
  getDisplay: () => "bar",
  getVizSettings: () => ({
    "graph.dimensions": ["period", "state"],
    "graph.metrics": ["actors"],
    "stackable.stack_type": "stacked",
  }),
};
