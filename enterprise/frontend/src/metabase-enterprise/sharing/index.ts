import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { MutableParametersSection } from "metabase-enterprise/sharing/components/MutableParametersSection";

/**
 * Initialize sharing plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("dashboard_subscription_filters")) {
    PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component =
      MutableParametersSection;
  }
}
