import { PLUGIN_AUTH_PROVIDERS, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * Initialize user provisioning plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("scim")) {
    PLUGIN_AUTH_PROVIDERS.UserProvisioningSettings = lazyPluginComponent(() =>
      import("./components/UserProvisioning").then(
        ({ UserProvisioning }) => UserProvisioning,
      ),
    );
  }
}
