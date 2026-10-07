import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type AiControlsPlugin = {
  isEnabled: boolean;
  getAiControlsRoutes: () => ReactNode;
  getAiControlsNavItems: () => ReactNode;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  getAiControlsNavItems: () => null,
});

export const PLUGIN_AI_CONTROLS = definePluginSlot(getDefaultPluginAiControls);
