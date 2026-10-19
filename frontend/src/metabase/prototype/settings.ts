import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
} from "./types";

export const LIVE_FILTER_PREVIEW: BooleanPrototypeSetting = {
  type: "boolean",
  key: "live-filter-preview",
  label: "Live filter preview",
  description:
    "Show the question next to the filter controls, with the filter applied as you change it",
  defaultValue: true,
};

export const LIVE_FILTER_PREVIEW_DELAY_MS: NumberPrototypeSetting = {
  type: "number",
  key: "live-filter-preview-delay-ms",
  label: "Preview delay, ms",
  description:
    "How long to wait after a change before the preview runs the query",
  defaultValue: 300,
  min: 0,
  max: 5000,
};

export const LIVE_FILTER_PREVIEW_SLOW_DATA: BooleanPrototypeSetting = {
  type: "boolean",
  key: "live-filter-preview-slow-data",
  label: "Preview slow data too",
  description: "By default, questions that read a slow table get no preview",
  defaultValue: false,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  LIVE_FILTER_PREVIEW,
  LIVE_FILTER_PREVIEW_DELAY_MS,
  LIVE_FILTER_PREVIEW_SLOW_DATA,
];
