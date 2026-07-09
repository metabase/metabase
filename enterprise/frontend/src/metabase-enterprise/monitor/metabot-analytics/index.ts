import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getUsageAuditingRoutes, getUsageAuditingUpsellRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_MONITOR.getUsageAuditingRoutes = hasPremiumFeature("ai_controls")
      ? getUsageAuditingRoutes
      : getUsageAuditingUpsellRoutes;
  }
}
