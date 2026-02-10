import { PLUGIN_ADMIN_TOOLS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import ErrorOverview from "./ErrorOverview";

/**
 * Initialize tools plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_ADMIN_TOOLS.COMPONENT = ErrorOverview;
  }
}
