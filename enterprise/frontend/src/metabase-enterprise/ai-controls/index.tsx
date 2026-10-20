import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getAiControlsNavItems, getAiControlsUpsellNavItems } from "./nav";
import {
  getAiControlsRoutes,
  getMcpToolsAccessRoutes,
  registerAiControlsPagePrefetch,
  registerAiControlsUpsellPagePrefetch,
} from "./routes";

export function initializePlugin() {
  PLUGIN_AI_CONTROLS.getAiControlsRoutes = getAiControlsRoutes;
  PLUGIN_AI_CONTROLS.getMcpToolsAccessRoutes = getMcpToolsAccessRoutes;

  if (hasPremiumFeature("ai_controls")) {
    PLUGIN_AI_CONTROLS.isEnabled = true;
    PLUGIN_AI_CONTROLS.getAiControlsNavItems = getAiControlsNavItems;
    registerAiControlsPagePrefetch();
  } else {
    PLUGIN_AI_CONTROLS.isEnabled = false;
    PLUGIN_AI_CONTROLS.getAiControlsNavItems = getAiControlsUpsellNavItems;
    registerAiControlsUpsellPagePrefetch();
  }
}
