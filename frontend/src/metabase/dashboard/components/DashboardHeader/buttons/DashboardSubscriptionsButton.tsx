import { PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK } from "embedding-sdk-bundle/components/public/subscriptions";
import {
  isEmbeddedAnalyticsJs,
  isEmbeddingSdk,
} from "metabase/embedding-sdk/config";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

export function DashboardSubscriptionsButton() {
  if (isEmbeddedAnalyticsJs()) {
    return <PLUGIN_EMBEDDING_IFRAME_SDK.DashboardSubscriptionsButton />;
  }

  // This flag isn't exclusive it could mean we're on either SDK or EAJS
  if (isEmbeddingSdk()) {
    return <PLUGIN_DASHBOARD_SUBSCRIPTIONS_SDK.DashboardSubscriptionsButton />;
  }

  return null;
}
