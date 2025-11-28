import { PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK } from "embedding-sdk-bundle/components/public/subscriptions";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

export function initializePlugin() {
  if (hasPremiumFeature("embedding_sdk")) {
    PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK.DashboardSubscriptionsButton =
      DashboardSubscriptionsButton;
  }
}
