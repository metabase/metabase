import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useAiControlsNavItems } from "./nav";
import { getAiControlsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("ai_controls")) {
    PLUGIN_AI_CONTROLS.isEnabled = true;
    PLUGIN_AI_CONTROLS.getAiControlsRoutes = getAiControlsRoutes;
    PLUGIN_AI_CONTROLS.useAiControlsNavItems = useAiControlsNavItems;
  }
}
