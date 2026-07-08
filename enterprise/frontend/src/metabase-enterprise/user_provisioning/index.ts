import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { UserProvisioning } from "./components/UserProvisioning";

/**
 * Initialize user provisioning plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("scim")) {
    PLUGIN_AUTH_PROVIDERS.UserProvisioningSettings = UserProvisioning;
  }
}
