import type { PrototypeSetting, SegmentedPrototypeSetting } from "./types";

/** How a dashboard card gives access to its editing options in edit mode. */
export const DASHCARD_EDITING_MODE: SegmentedPrototypeSetting = {
  type: "segmented",
  key: "dashcard-editing-mode",
  label: "Card editing",
  description:
    "Current: toolbar on hover, grid background. Click to select: no toolbar, click a card to select it (blue border), no grid background.",
  options: [
    { value: "current", label: "Current" },
    { value: "select", label: "Click to select" },
  ],
  defaultValue: "select",
};

/**
 * The settings of the current prototype, in the order the prototype settings
 * submenu shows them. Each prototype branch lists its own settings here and
 * reads them with `usePrototypeSetting`. See PROTOTYPE.md.
 */
export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [
  DASHCARD_EDITING_MODE,
];
