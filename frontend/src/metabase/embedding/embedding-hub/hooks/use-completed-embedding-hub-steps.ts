import { useMemo } from "react";

import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";

import type { EmbeddingHubStepId } from "../types";

/**
 * Embedding Hub completion steps should be derived by the instance state at the time, or tracked manually in instance settings for some of them.
 */
export const useCompletedEmbeddingHubSteps = (): {
  data: Record<EmbeddingHubStepId, boolean>;
  isLoading: boolean;
} => {
  const { data: embeddingHubChecklist, isLoading } =
    useGetEmbeddingHubChecklistQuery(undefined, {
      refetchOnMountOrArgChange: true,
    });

  const data = useMemo(() => {
    if (isLoading || !embeddingHubChecklist) {
      return {
        // main checklist
        "create-test-embed": false,
        "add-data": false,
        "create-dashboard": false,
        "configure-row-column-security": false,
        "secure-embeds": false,
        "embed-production": false,
        "create-models": false,
        "data-permissions-and-enable-tenants": false,

        // "configure data permissions and enable tenants" sub-checklist
        "create-tenants": false,
        "enable-tenants": false,
        "setup-data-segregation-strategy": false,
      };
    }

    return embeddingHubChecklist;
  }, [embeddingHubChecklist, isLoading]);

  return { data, isLoading };
};
