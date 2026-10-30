import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getAiControlsNavItems,
  getAiControlsPermissionsNavItems,
  getAiControlsPermissionsUpsellNavItems,
  getAiControlsUpsellNavItems,
} from "./nav";
import {
  getAiControlsPermissionsRoutes,
  getAiControlsPermissionsUpsellRoutes,
  getAiControlsRoutes,
  getAiControlsUpsellRoutes,
  registerAiControlsPagePrefetch,
  registerAiControlsUpsellPagePrefetch,
} from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("ai_controls")) {
    PLUGIN_AI_CONTROLS.isEnabled = true;
    PLUGIN_AI_CONTROLS.getAiControlsRoutes = getAiControlsRoutes;
    PLUGIN_AI_CONTROLS.getPermissionsRoutes = getAiControlsPermissionsRoutes;
    PLUGIN_AI_CONTROLS.getAiControlsNavItems = getAiControlsNavItems;
    PLUGIN_AI_CONTROLS.getPermissionsNavItems =
      getAiControlsPermissionsNavItems;
    registerAiControlsPagePrefetch();
  } else {
    PLUGIN_AI_CONTROLS.isEnabled = false;
    PLUGIN_AI_CONTROLS.getAiControlsRoutes = getAiControlsUpsellRoutes;
    PLUGIN_AI_CONTROLS.getPermissionsRoutes =
      getAiControlsPermissionsUpsellRoutes;
    PLUGIN_AI_CONTROLS.getAiControlsNavItems = getAiControlsUpsellNavItems;
    PLUGIN_AI_CONTROLS.getPermissionsNavItems =
      getAiControlsPermissionsUpsellNavItems;
    registerAiControlsUpsellPagePrefetch();
  }
}
