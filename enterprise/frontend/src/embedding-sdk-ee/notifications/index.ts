import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";
import { QuestionAlertsButton } from "./QuestionAlertsButton";

export function initializePlugin() {
  if (hasPremiumFeature("embedding_sdk")) {
    PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton =
      DashboardSubscriptionsButton;
    PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton = QuestionAlertsButton;
  }
}
