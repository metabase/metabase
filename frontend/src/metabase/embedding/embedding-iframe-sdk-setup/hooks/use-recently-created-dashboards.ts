import { useMemo } from "react";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserId } from "metabase/selectors/user";
import type { SearchResult } from "metabase-types/api";

import type { SdkIframeEmbedSetupRecentItem } from "../types";

/**
 * Hook to fetch dashboards created by the current user.
 * Used for prioritize newly created dashboards in the embed wizard.
 */
export const useRecentlyCreatedDashboards = () => {
  const currentUserId = useSelector(getUserId);

  const { data: searchResults, isLoading } = useSearchQuery(
    {
      models: ["dashboard"],
      created_by: currentUserId ? [currentUserId] : undefined,
      limit: 5,

      // If the dashboard is created more than 1 hour ago,
      // it is likely stale and latest activity should take priority.
      created_at: "past1hours~",
    },
    { refetchOnMountOrArgChange: true },
  );

  const recentlyCreatedDashboards: SdkIframeEmbedSetupRecentItem[] =
    useMemo(() => {
      if (!searchResults?.data) {
        return [];
      }

      return searchResults.data
        .filter((result) => result.id !== undefined)
        .sort(sortSearchResultByCreationTime)
        .map((result) => _.pick(result, ["id", "name", "description"]));
    }, [searchResults?.data]);

  return {
    recentlyCreatedDashboards,
    isLoading,
  };
};

const sortSearchResultByCreationTime = (a: SearchResult, b: SearchResult) => {
  if (a.created_at === null || b.created_at === null) {
    return 0;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
};
