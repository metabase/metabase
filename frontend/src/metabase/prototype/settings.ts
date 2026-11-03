import type {
  BooleanPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
} from "./types";

export const DATA_SPEED: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "data-speed",
  label: "Data",
  description:
    "Fast: queries run at once, like on a fast database. Slow: each query waits about 5 seconds, like on a slow data warehouse.",
  options: [
    { value: "fast", label: "Fast" },
    { value: "slow", label: "Slow" },
  ],
  defaultValue: "fast",
};

export const FILTER_LAYOUT_ANIMATION: BooleanPrototypeSetting = {
  type: "boolean",
  key: "filter-layout-animation",
  label: "Filter layout animation",
  description:
    "The filters move when the filter bar changes between one line and indented rows.",
  defaultValue: true,
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  DATA_SPEED,
  FILTER_LAYOUT_ANIMATION,
];
