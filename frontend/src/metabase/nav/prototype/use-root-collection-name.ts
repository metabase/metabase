import { match } from "ts-pattern";
import { t } from "ttag";

import { useGitIntegrationEnabled } from "./use-git-integration-enabled";
import { useNavVariant } from "./use-nav-variant";

/**
 * PROTOTYPE: the name shown for the root collection ("Our analytics"), which
 * the nav never shows itself. It matches the nav tab its folders sit under:
 * with git integration on, "Saved" ("Collections" in "Modern nav - C",
 * "Other collections" in "- D"); with it off, "Collections".
 */
export function useRootCollectionName(): string {
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const { variant } = useNavVariant();
  if (!isGitIntegrationEnabled) {
    return t`Collections`;
  }
  return match(variant)
    .with("modern-nav-c", () => t`Collections`)
    .with("modern-nav-d", () => t`Other collections`)
    .otherwise(() => t`Saved`);
}
