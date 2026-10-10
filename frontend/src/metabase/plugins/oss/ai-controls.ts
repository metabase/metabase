import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

export type AiControlsPlugin = {
  isEnabled: boolean;
  getAiControlsRoutes: () => ReactNode;
  getMcpToolsAccessRoutes: () => ReactNode;
  getAiControlsNavItems: () => ReactNode;
  ProviderFallbackSettings: ComponentType;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  getMcpToolsAccessRoutes: () => null,
  getAiControlsNavItems: () => null,
  ProviderFallbackSettings: PluginPlaceholder,
});

export const PLUGIN_AI_CONTROLS = definePluginSlot(getDefaultPluginAiControls);
