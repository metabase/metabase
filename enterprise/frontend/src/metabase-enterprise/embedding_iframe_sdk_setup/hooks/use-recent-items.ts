import { useCallback, useMemo, useState } from "react";

import { useListRecentsQuery } from "metabase/api";
import type { RecentItem } from "metabase-types/api";

import { EMBED_RESOURCE_LIST_MAX_RECENTS } from "../constants";
import type { SdkIframeEmbedSetupRecentItem } from "../types";

export const useRecentItems = () => {
  const { data: apiRecentItems, isLoading } = useListRecentsQuery(
    { context: ["views", "selections"] },
    { refetchOnMountOrArgChange: true },
  );

  // Users can select dashboards from the dashboard picker.
  const [localRecentDashboards, setLocalRecentDashboards] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  // Users can select questions from the question picker.
  const [localRecentQuestions, setLocalRecentQuestions] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  const recentDashboards = useMemo(() => {
    return getCombinedRecentItems(
      "dashboard",
      localRecentDashboards,
      apiRecentItems ?? [],
    );
  }, [apiRecentItems, localRecentDashboards]);

  const recentQuestions = useMemo(() => {
    return getCombinedRecentItems(
      "card",
      localRecentQuestions,
      apiRecentItems ?? [],
    );
  }, [apiRecentItems, localRecentQuestions]);

  const addRecentItem = useCallback(
    (
      type: "dashboard" | "question",
      recentItemToAdd: SdkIframeEmbedSetupRecentItem,
    ) => {
      const setRecentItems =
        type === "dashboard"
          ? setLocalRecentDashboards
          : setLocalRecentQuestions;

      // Bump the added item to the top of the list.
      setRecentItems((prev) =>
        [
          recentItemToAdd,
          ...prev.filter((recentItem) => recentItem.id !== recentItemToAdd.id),
        ].slice(0, EMBED_RESOURCE_LIST_MAX_RECENTS),
      );
    },
    [],
  );

  return {
    recentDashboards,
    recentQuestions,
    addRecentItem,
    isRecentsLoading: isLoading,
  };
};

/**
 * Combine the recent items from the activity log with the
 * recent items that users have chosen in the modal locally.
 */
const getCombinedRecentItems = (
  model: "dashboard" | "card",
  localRecentItems: SdkIframeEmbedSetupRecentItem[],
  apiRecentItems: RecentItem[],
): SdkIframeEmbedSetupRecentItem[] => {
  const localRecentItemIds = new Set(
    localRecentItems.map((recentItem) => recentItem.id),
  );

  const filteredApiRecentItems = apiRecentItems
    .filter((recentItem) => recentItem.model === model)
    .slice(0, EMBED_RESOURCE_LIST_MAX_RECENTS);

  // If the user has already selected the item which already exists
  // in the activity log, we don't want to show it twice.
  const deduplicatedApiRecentItems = filteredApiRecentItems.filter(
    (recentItem) => !localRecentItemIds.has(recentItem.id),
  );

  return [...localRecentItems, ...deduplicatedApiRecentItems].slice(
    0,
    EMBED_RESOURCE_LIST_MAX_RECENTS,
  );
};
