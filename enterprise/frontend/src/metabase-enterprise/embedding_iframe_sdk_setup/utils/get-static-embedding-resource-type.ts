import type { EmbedResourceType } from "metabase/public/lib/types";
import type { SdkIframeEmbedSetupSettings } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

export const getStaticEmbeddingResourceType = (
  settings: SdkIframeEmbedSetupSettings,
): EmbedResourceType | null => {
  if (settings.dashboardId) {
    return "dashboard";
  }

  return settings.questionId ? "question" : null;
};
