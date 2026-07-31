import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { PLUGIN_NOTIFICATIONS_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";
import { QuestionAlertsButton } from "./QuestionAlertsButton";

export function initializePlugin() {
  if (hasPremiumFeature(EMBEDDING_SDK_CONFIG.tokenFeatureKey)) {
    PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton =
      DashboardSubscriptionsButton;
    PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton = QuestionAlertsButton;
  }
}
