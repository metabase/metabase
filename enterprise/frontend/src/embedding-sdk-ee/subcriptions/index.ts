import { DASHBOARD_SUBSCRIPTIONS_SDK_PLUGIN } from "embedding-sdk-bundle/components/public/subscriptions";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

export function initializePlugin() {
  if (hasPremiumFeature("embedding_sdk")) {
    DASHBOARD_SUBSCRIPTIONS_SDK_PLUGIN.DashboardSubscriptionsButton =
      DashboardSubscriptionsButton;
  }
}
