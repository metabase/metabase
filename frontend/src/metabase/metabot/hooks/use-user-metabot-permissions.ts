import { useMemo } from "react";

import { useGetUserMetabotPermissionsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { canAccessSettings } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";

import { useMetabotEnabledEmbeddingAware } from "./use-metabot-embedding-aware-enabled";

/** Returns granular metabot permission booleans for the current user.
 * Combines the global metabot-enabled setting with per-user group permissions.
 * Returns all false while loading or on error.
 * Access booleans (`has*Access`) only depend on feature toggles and permissions.
 * Usage booleans (`canUse*`) additionally require the AI provider to be configured. */
export const useUserMetabotPermissions = () => {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware({
    requireConfiguration: false,
  });
  const isConfigured = !!useSetting("llm-metabot-configured?");
  const canConfigure = useSelector(canAccessSettings);
  const { data, isLoading, isError } = useGetUserMetabotPermissionsQuery(
    undefined,
    { skip: !isMetabotEnabled },
  );

  const perms = data?.permissions;
  const hasMetabotAccess =
    isMetabotEnabled && !isLoading && perms?.metabot === "yes";
  const hasSqlGenerationAccess =
    hasMetabotAccess && perms?.["metabot-sql-generation"] === "yes";
  const hasNlqAccess = hasMetabotAccess && perms?.["metabot-nlq"] === "yes";
  const hasOtherToolsAccess =
    hasMetabotAccess && perms?.["metabot-other-tools"] === "yes";

  return useMemo(
    () => ({
      isLoading,
      isError,
      isConfigured,
      canConfigure,
      hasMetabotAccess,
      canUseMetabot: hasMetabotAccess && isConfigured,
      hasSqlGenerationAccess,
      canUseSqlGeneration: hasSqlGenerationAccess && isConfigured,
      hasNlqAccess,
      canUseNlq: hasNlqAccess && isConfigured,
      hasOtherToolsAccess,
      canUseOtherTools: hasOtherToolsAccess && isConfigured,
    }),
    [
      canConfigure,
      hasMetabotAccess,
      hasNlqAccess,
      hasOtherToolsAccess,
      hasSqlGenerationAccess,
      isConfigured,
      isError,
      isLoading,
    ],
  );
};
