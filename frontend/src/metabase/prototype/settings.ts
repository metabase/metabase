import type { PrototypeSetting, SegmentedPrototypeSetting } from "./types";

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

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [DATA_SPEED];
