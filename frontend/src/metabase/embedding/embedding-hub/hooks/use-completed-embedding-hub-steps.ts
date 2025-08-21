import { useMemo } from "react";

import type { EmbeddingStepId } from "../components";

export const useCompletedEmbeddingHubSteps = (): Record<
  EmbeddingStepId,
  boolean
> => {
  const completedSteps = useMemo(() => {
    return {
      "test-embed": true, // Example: check if user has created test embeds
      "add-data": false, // Example: hasConnectedDatabase
      "create-dashboard": false, // Example: hasDashboards
      "configure-sandboxing": false, // Example: hasSandboxing
      "secure-embeds": false, // Example: hasJWTConfigured
      "embed-production": false, // Example: check if embeds are in production use
    };
  }, []);

  return completedSteps;
};
