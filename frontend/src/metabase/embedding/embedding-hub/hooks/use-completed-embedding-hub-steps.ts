import { useMemo } from "react";

import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { useSetting } from "metabase/common/hooks";

import type { EmbeddingHubStepId } from "../types";

/**
 * Embedding Hub completion steps should be derived by the instance state at the time, or tracked manually in instance settings for some of them.
 */
export const useCompletedEmbeddingHubSteps = (): Record<
  EmbeddingHubStepId,
  boolean
> => {
  const { data: embeddingHubChecklist } = useGetEmbeddingHubChecklistQuery();

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  const isSsoReady =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const isTestEmbedCreated = useSetting(
    "embedding-hub-test-embed-snippet-created",
  );

  const isProductionEmbedCreated = useSetting(
    "embedding-hub-production-embed-snippet-created",
  );

  return useMemo(() => {
    return {
      "create-test-embed": isTestEmbedCreated ?? false,
      "add-data": embeddingHubChecklist?.["add-data"] ?? false,
      "create-dashboard": embeddingHubChecklist?.["create-dashboard"] ?? false,
      "configure-row-column-security": false,
      "secure-embeds": isSsoReady,
      "embed-production": isProductionEmbedCreated ?? false,
    };
  }, [
    isTestEmbedCreated,
    embeddingHubChecklist,
    isSsoReady,
    isProductionEmbedCreated,
  ]);
};
