import type {
  NumberPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const AUTO_APPLY_TYPED_VALUES: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "auto-apply-typed-values",
  label: "Apply typed values",
  description:
    "Clicks and selections apply immediately. Typed values apply after a pause in typing, or only when the field loses focus. In both modes, Enter and leaving the field apply them too.",
  options: [
    { value: "pause", label: "After a pause" },
    { value: "blur", label: "On blur" },
  ],
  defaultValue: "pause",
};

export const AUTO_APPLY_DELAY_MS: NumberPrototypeSetting = {
  type: "number",
  key: "auto-apply-delay-ms",
  label: "Typing pause, ms",
  description: "How long to wait after the last key press",
  defaultValue: 250,
  min: 0,
  max: 5000,
};

export const LOADING_SPINNER_DELAY_MS: NumberPrototypeSetting = {
  type: "number",
  key: "loading-spinner-delay-ms",
  label: "Loading spinner delay, ms",
  description:
    "How long a query runs before the question shows the loading spinner. Faster queries show no spinner. 0 shows it at once, as before.",
  defaultValue: 500,
  min: 0,
  max: 5000,
};

export const FILTER_SUMMARY_TRIGGER: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "filter-summary-trigger",
  label: "Summarize filters",
  description:
    "Replace the filter pills with a short AI summary. After inactivity: when the pointer is away from the filter bar for a while. When saved: when the question is saved and has no changes. Hover the summary to see the pills.",
  options: [
    { value: "inactivity", label: "After inactivity" },
    { value: "saved", label: "When saved" },
    { value: "off", label: "Off" },
  ],
  defaultValue: "off",
};

export const FILTER_SUMMARY_DELAY_MS: NumberPrototypeSetting = {
  type: "number",
  key: "filter-summary-delay-ms",
  label: "Summary delay, ms",
  description:
    "How long the filter bar waits with no activity before it shows the summary",
  defaultValue: 4000,
  min: 0,
  max: 60000,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  AUTO_APPLY_TYPED_VALUES,
  AUTO_APPLY_DELAY_MS,
  LOADING_SPINNER_DELAY_MS,
  FILTER_SUMMARY_TRIGGER,
  FILTER_SUMMARY_DELAY_MS,
];
