import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getAiAuditingRoutes, getAiAuditingUpsellRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_MONITOR.isAiAuditingEnabled = true;
    PLUGIN_MONITOR.getAiAuditingRoutes = hasPremiumFeature("ai_controls")
      ? getAiAuditingRoutes
      : getAiAuditingUpsellRoutes;
  }
}
