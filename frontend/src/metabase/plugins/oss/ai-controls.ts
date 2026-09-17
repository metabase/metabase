import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type AiControlsPlugin = {
  isEnabled: boolean;
  getAiControlsRoutes: () => ReactNode;
  getMcpToolsAccessRoutes: () => ReactNode;
  getAiControlsNavItems: () => ReactNode;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  getMcpToolsAccessRoutes: () => null,
  getAiControlsNavItems: () => null,
});

export const PLUGIN_AI_CONTROLS = definePluginSlot(getDefaultPluginAiControls);
