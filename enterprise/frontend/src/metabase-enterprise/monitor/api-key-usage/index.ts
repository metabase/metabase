import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getApiKeyUsageRoutes } from "./routes";

/**
 * API key usage is gated on `audit_app` (the same token feature that gates the rest of the
 * Monitor "Logs and activity" section), not on any AI-specific feature — this page is plain
 * REST-API-call analytics and intentionally does not live under AI Auditing.
 */
export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_MONITOR.isApiKeyUsageEnabled = true;
    PLUGIN_MONITOR.getApiKeyUsageRoutes = getApiKeyUsageRoutes;
  }
}
