import { PLUGIN_AUXILIARY_CONNECTIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AuxiliaryConnectionsSection } from "./AuxiliaryConnectionsSection";

export function initializePlugin() {
  if (!hasPremiumFeature("advanced_permissions")) {
    return;
  }

  PLUGIN_AUXILIARY_CONNECTIONS.AuxiliaryConnectionsSection =
    AuxiliaryConnectionsSection;
}
