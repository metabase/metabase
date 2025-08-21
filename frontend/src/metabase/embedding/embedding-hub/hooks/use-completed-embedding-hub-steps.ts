import { useMemo } from "react";

import type { EmbeddingHubStepId } from "../types";

/**
 * Embedding Hub completion steps should be derived by the instance state at the time, or tracked manually in instance settings for some of them.
 *
 * TODO: make this live.
 */
export const useCompletedEmbeddingHubSteps = (): Record<
  EmbeddingHubStepId,
  boolean
> => {
  return useMemo(() => {
    return {
      "create-test-embed": true,
      "add-data": false,
      "create-dashboard": false,
      "configure-sandboxing": false,
      "secure-embeds": false,
      "embed-production": false,
    };
  }, []);
};
