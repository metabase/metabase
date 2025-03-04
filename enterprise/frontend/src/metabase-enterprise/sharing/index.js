import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { MutableParametersSection } from "metabase-enterprise/sharing/components/MutableParametersSection";
export const activate = () => {
if (hasPremiumFeature("dashboard_subscription_filters")) {
  PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component =
    MutableParametersSection;
}

};
