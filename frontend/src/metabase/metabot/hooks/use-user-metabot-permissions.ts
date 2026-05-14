import { useMemo } from "react";

import { useGetUserMetabotPermissionsQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";

import { useMetabotEnabledEmbeddingAware } from "./use-metabot-embedding-aware-enabled";

/** Returns granular metabot permission booleans for the current user.
 * Combines the global metabot-enabled setting with per-user group permissions.
 * Returns all false while loading or on error. */
export const useUserMetabotPermissions = () => {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const isAuthenticated = !!useSelector(getUser);
  const { data, isLoading, isError } = useGetUserMetabotPermissionsQuery(
    undefined,
    { skip: !isMetabotEnabled || !isAuthenticated },
  );

  const perms = data?.permissions;
  const hasAccess = isMetabotEnabled && !isLoading && perms?.metabot === "yes";

  return useMemo(
    () => ({
      isLoading,
      isError,
      canUseMetabot: hasAccess,
      canUseSqlGeneration:
        hasAccess && perms?.["metabot-sql-generation"] === "yes",
      canUseNlq: hasAccess && perms?.["metabot-nlq"] === "yes",
      canUseOtherTools: hasAccess && perms?.["metabot-other-tools"] === "yes",
    }),
    [isLoading, isError, hasAccess, perms],
  );
};
