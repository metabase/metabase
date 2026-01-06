import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

export function initializePlugin() {
  if (hasPremiumFeature("embedding_sdk")) {
    PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton =
      DashboardSubscriptionsButton;
  }
}
