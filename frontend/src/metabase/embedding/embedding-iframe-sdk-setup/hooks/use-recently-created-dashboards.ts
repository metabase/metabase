import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserId } from "metabase/selectors/user";

import type { SdkIframeEmbedSetupRecentItem } from "../types";

/**
 * Hook to fetch dashboards created in the last hour by the current user.
 * This is used to prioritize newly created x-ray dashboards in the embedding wizard.
 */
export const useRecentlyCreatedDashboards = () => {
  const currentUserId = useSelector(getUserId);

  const { data: searchResults, isLoading } = useSearchQuery(
    {
      models: ["dashboard"],
      created_by: currentUserId ? [currentUserId] : undefined,
      limit: 5,
    },
    {
      // Skip the query if we don't have a user ID
      skip: !currentUserId,
      refetchOnMountOrArgChange: true,
    },
  );

  const recentlyCreatedDashboards: SdkIframeEmbedSetupRecentItem[] =
    useMemo(() => {
      if (!searchResults?.data) {
        return [];
      }

      return searchResults.data
        .filter(
          (item): item is typeof item & { id: number } =>
            typeof item.id === "number",
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
        }));
    }, [searchResults?.data]);

  return {
    recentlyCreatedDashboards,
    isLoading,
  };
};
