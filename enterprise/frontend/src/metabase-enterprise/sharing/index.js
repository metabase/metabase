import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import MutableParametersSection from "metabase-enterprise/sharing/components/MutableParametersSection";

if (hasPremiumFeature("advanced_config")) {
  PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component =
    MutableParametersSection;
}
