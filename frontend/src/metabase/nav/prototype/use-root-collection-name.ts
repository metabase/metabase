import { t } from "ttag";

import { useGitIntegrationEnabled } from "./use-git-integration-enabled";

/**
 * PROTOTYPE: the name shown for the root collection ("Our analytics"), which
 * the nav never shows itself. It matches the nav heading its folders sit
 * under: "Saved" with git integration on, "Collections" with it off.
 */
export function useRootCollectionName(): string {
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  return isGitIntegrationEnabled ? t`Saved` : t`Collections`;
}
