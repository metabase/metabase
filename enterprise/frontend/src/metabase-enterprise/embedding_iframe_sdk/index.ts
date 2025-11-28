import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "../../embedding-sdk-ee/subcriptions/DashboardSubscriptionsButton";

if (hasPremiumFeature("embedding_simple")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense = () => true;
  PLUGIN_EMBEDDING_IFRAME_SDK.DashboardSubscriptionsButton =
    DashboardSubscriptionsButton;
}
