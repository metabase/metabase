import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { isEmbeddingEajs, isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

export function DashboardSubscriptionsButton() {
  if (isEmbeddingEajs()) {
    return <PLUGIN_EMBEDDING_IFRAME_SDK.DashboardSubscriptionsButton />;
  }

  // This flag isn't exclusive it could mean we're on either modular embedding or modular embedding SDK
  if (isEmbeddingSdk()) {
    return <PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton />;
  }

  return null;
}
