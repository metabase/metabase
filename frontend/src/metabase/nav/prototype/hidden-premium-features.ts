import type { TokenFeature } from "metabase-types/api";

import { getIsGitIntegrationEnabled } from "./use-git-integration-enabled";

// PROTOTYPE: with git integration on, these features are simulated as gone.
const HIDDEN_WITH_GIT_INTEGRATION: Partial<Record<TokenFeature, true>> = {
  official_collections: true,
  content_verification: true,
};

/** Whether the prototype hides a premium feature the instance really has. */
export function isPremiumFeatureHiddenByPrototype(
  feature: TokenFeature,
): boolean {
  return (
    HIDDEN_WITH_GIT_INTEGRATION[feature] === true &&
    getIsGitIntegrationEnabled()
  );
}
