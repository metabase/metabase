import type { ReactNode } from "react";

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

export const PLUGIN_AI_CONTROLS = getDefaultPluginAiControls();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AI_CONTROLS, getDefaultPluginAiControls());
}
