import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export function initializePlugin() {
  if (hasPremiumFeature("multi-factor-auth")) {
    PLUGIN_MULTI_FACTOR_AUTH.isEnabled = () => true;
  }
}
