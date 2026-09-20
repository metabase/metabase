import { definePluginSlot } from "metabase/plugin-slots";

import type { ComputedVisualizationSettings, SettingsExtra } from "./types";

type VisualizationBehavior = {
  transformComputedSettings: (
    settings: ComputedVisualizationSettings,
    extra: SettingsExtra,
  ) => ComputedVisualizationSettings;
  getTooltipRoot: () => HTMLElement | null;
};

export const PLUGIN_VISUALIZATION_BEHAVIOR = definePluginSlot(
  (): VisualizationBehavior => ({
    transformComputedSettings: (settings) => settings,
    getTooltipRoot: () => document.body,
  }),
);
