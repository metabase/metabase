import type { PrototypeSetting, SegmentedPrototypeSetting } from "./types";

export const VISUALIZATION_EDITOR_LAYOUT: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "visualization-editor-layout",
  label: "Visualization editor",
  description:
    "Modal: a full-size modal. Floating: the dashboard card moves to the center of the screen, with the settings in a card next to it.",
  options: [
    { value: "modal", label: "Modal" },
    { value: "floating", label: "Floating" },
  ],
  defaultValue: "modal",
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  VISUALIZATION_EDITOR_LAYOUT,
];
