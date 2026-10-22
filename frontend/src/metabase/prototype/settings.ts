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

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  AUTO_APPLY_TYPED_VALUES,
  AUTO_APPLY_DELAY_MS,
  LOADING_SPINNER_DELAY_MS,
];
