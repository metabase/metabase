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
  const { data: checklistResponse, isLoading } =
    useGetEmbeddingHubChecklistQuery(undefined, {
      refetchOnMountOrArgChange: true,
    });

  const data = useMemo(() => {
    const checklist = checklistResponse?.checklist;

    if (isLoading || !checklist) {
      return {
        // main checklist
        "create-test-embed": false,
        "add-data": false,
        "create-dashboard": false,
        "configure-row-column-security": false,
        "sso-configured": false,
        "embed-production": false,
        "data-permissions-and-enable-tenants": false,

        // "configure data permissions and enable tenants" sub-checklist
        "create-tenants": false,
        "enable-tenants": false,
        "setup-data-segregation-strategy": false,

        // "configure SSO" sub-checklist
        "sso-auth-manual-tested": false,
      };
    }

    // For the main embedding hub, the SSO step is only complete if both
    // SSO is configured AND the user has manually acknowledged it works
    return {
      ...checklist,
      "sso-configured":
        checklist["sso-configured"] && checklist["sso-auth-manual-tested"],
    };
  }, [checklistResponse, isLoading]);

  return { data, isLoading };
};
