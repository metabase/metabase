import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

export type AiControlsPlugin = {
  isEnabled: boolean;
  /** Routes mounted under `/admin/metabot`. */
  getAiControlsRoutes: () => ReactNode;
  /** Routes mounted under `/admin/permissions` (AI feature and MCP tool access). */
  getPermissionsRoutes: () => ReactNode;
  getAiControlsNavItems: () => ReactNode;
  getPermissionsNavItems: () => ReactNode;
};

const getDefaultPluginAiControls = (): AiControlsPlugin => ({
  isEnabled: false,
  getAiControlsRoutes: () => null,
  getPermissionsRoutes: () => null,
  getAiControlsNavItems: () => null,
  getPermissionsNavItems: () => null,
});

export const PLUGIN_AI_CONTROLS = definePluginSlot(getDefaultPluginAiControls);
