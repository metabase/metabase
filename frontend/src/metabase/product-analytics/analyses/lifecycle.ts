import { t } from "ttag";

import { EventPickerWidget } from "../components/settings/EventPickerWidget";
import type { LifecycleStateName } from "../spec/types";

import { commonSettings } from "./common-settings";
import {
  getCommonSpec,
  getEventPickerProps,
  isOneOf,
  isUnknownArray,
  isValidEvent,
  savedEvent,
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
  "lifecycle.active": {
    getTitle: () => t`Active means`,
    getSection: () => "setup",
    widget: EventPickerWidget,
    getDefault: () => savedEvent("active"),
    isValid: (value, context) => isValidEvent(context, value),
    getProps: getEventPickerProps,
  },
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
  getEventRefs: (settings) => [settings["lifecycle.active"]],
  toSpec: (settings, events) => ({
    ...getCommonSpec("lifecycle", settings),
    lifecycle: {
      active: { flag: events.flagFor(settings["lifecycle.active"]) },
      // granularity's units exclude "hour" here; isValid enforces it.
      period: settings.granularity === "hour" ? "day" : settings.granularity,
    },
    output: { lifecycleShown: settings["lifecycle.shown"] },
  }),
  getDisplay: () => "bar",
  getVizSettings: () => ({
    "graph.dimensions": ["period", "state"],
    "graph.metrics": ["actors"],
    "stackable.stack_type": "stacked",
  }),
};
