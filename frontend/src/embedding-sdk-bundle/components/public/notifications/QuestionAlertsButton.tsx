import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";

export function QuestionAlertsButton() {
  // XXX: Uncomment this when working on EMB-996
  // if (isEmbeddingEajs()) {
  //   return <PLUGIN_EMBEDDING_IFRAME_SDK.QuestionAlertsButton />;
  // }

  // This flag isn't exclusive it could mean we're on either modular embedding or modular embedding SDK
  if (isEmbeddingSdk()) {
    return <PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton />;
  }

  return null;
}
