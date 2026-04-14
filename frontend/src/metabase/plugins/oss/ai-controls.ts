import type { ComponentType, ReactNode } from "react";

export type AiControlsPlugin = {
  isEnabled: boolean;
  getAiControlsRoutes: () => ReactNode;
  AiControlsNavItems: ComponentType | null;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  AiControlsNavItems: null,
});

export const PLUGIN_AI_CONTROLS = getDefaultPluginAiControls();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AI_CONTROLS, getDefaultPluginAiControls());
}
