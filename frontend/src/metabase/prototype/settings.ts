import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const LIVE_FILTER_PREVIEW_MODE: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "live-filter-preview-mode",
  label: "Live filter preview",
  description:
    "Where to show the question with the filter applied as you change it: next to the filter controls, or instead of the main chart",
  options: [
    { value: "off", label: "Off" },
    { value: "popover", label: "Popover" },
    { value: "main-chart", label: "Main chart" },
  ],
  defaultValue: "popover",
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

export const LIVE_FILTER_PREVIEW_ANIMATION: BooleanPrototypeSetting = {
  type: "boolean",
  key: "live-filter-preview-animation",
  label: "Animate preview changes",
  description:
    "Move shapes to their new values instead of redrawing, on bar, line, area, combo, scatter, row, waterfall, pie, treemap and box plot charts. Sankey charts fade in. Tables, numbers, gauges, progress bars, default funnels and maps do not animate.",
  defaultValue: true,
};

export const LIVE_FILTER_PREVIEW_ANIMATION_MS: NumberPrototypeSetting = {
  type: "number",
  key: "live-filter-preview-animation-ms",
  label: "Animation duration, ms",
  defaultValue: 500,
  min: 0,
  max: 3000,
};

export const LIVE_FILTER_PREVIEW_ONION_SKIN: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "live-filter-preview-onion-skin-style",
  label: "Onion skin",
  description:
    "Compare the preview with the current result. Ghost: a grey copy of the current result behind the preview, on bar, line, area, combo and scatter charts. Difference: the increase and decrease stacked on the lower value, on bar, row and line charts with one series. Line charts become area charts.",
  options: [
    { value: "off", label: "Off" },
    { value: "ghost", label: "Ghost" },
    { value: "difference", label: "Difference" },
  ],
  defaultValue: "off",
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  LIVE_FILTER_PREVIEW_MODE,
  LIVE_FILTER_PREVIEW_DELAY_MS,
  LIVE_FILTER_PREVIEW_ONION_SKIN,
  LIVE_FILTER_PREVIEW_ANIMATION,
  LIVE_FILTER_PREVIEW_ANIMATION_MS,
  LIVE_FILTER_PREVIEW_SLOW_DATA,
];
