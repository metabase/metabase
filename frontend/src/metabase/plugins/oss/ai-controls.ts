import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type AiControlsPlugin = {
  isEnabled: boolean;
  getAiControlsRoutes: () => ReactNode;
  getAiControlsNavItems: () => ReactNode;
  ProviderFallbackSettings: ComponentType;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  getAiControlsNavItems: () => null,
  ProviderFallbackSettings: PluginPlaceholder,
});

export const PLUGIN_AI_CONTROLS = getDefaultPluginAiControls();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AI_CONTROLS, getDefaultPluginAiControls());
}
