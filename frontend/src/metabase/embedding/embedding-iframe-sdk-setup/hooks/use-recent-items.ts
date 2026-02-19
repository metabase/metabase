import { useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";

import { useListRecentsQuery } from "metabase/api";
import type { RecentItem } from "metabase-types/api";

import { EMBED_RESOURCE_LIST_MAX_RECENTS } from "../constants";
import type { SdkIframeEmbedSetupRecentItem } from "../types";

import { useRecentlyCreatedDashboards } from "./use-recently-created-dashboards";

export const useRecentItems = () => {
  const { data: apiRecentItems, isLoading: isRecentsLoading } =
    useListRecentsQuery(
      { context: ["views", "selections"] },
      { refetchOnMountOrArgChange: true },
    );

  const {
    recentlyCreatedDashboards,
    isLoading: isRecentlyCreatedDashboardsLoading,
  } = useRecentlyCreatedDashboards();

  // Users can select dashboards from the dashboard picker.
  const [localRecentDashboards, setLocalRecentDashboards] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  // Users can select questions from the question picker.
  const [localRecentQuestions, setLocalRecentQuestions] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  // Users can select collections from the collection picker.
  const [localRecentCollections, setLocalRecentCollections] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  const recentDashboards = useMemo(() => {
    return getCombinedRecentItems(
      "dashboard",
      // Recently created dashboards are prioritized first, then local selections,
      // then recent views from the activity log.
      [...recentlyCreatedDashboards, ...localRecentDashboards],
      apiRecentItems ?? [],
    );
  }, [apiRecentItems, localRecentDashboards, recentlyCreatedDashboards]);

  const recentQuestions = useMemo(() => {
    return getCombinedRecentItems(
      "card",
      localRecentQuestions,
      apiRecentItems ?? [],
    );
  }, [apiRecentItems, localRecentQuestions]);

  const recentCollections = useMemo(() => {
    return getCombinedRecentItems(
      "collection",
      localRecentCollections,
      apiRecentItems ?? [],
    );
  }, [apiRecentItems, localRecentCollections]);

  const addRecentItem = useCallback(
    (
      type: "dashboard" | "question" | "collection",
      recentItemToAdd: SdkIframeEmbedSetupRecentItem,
    ) => {
      const setRecentItems = match(type)
        .with("dashboard", () => setLocalRecentDashboards)
        .with("question", () => setLocalRecentQuestions)
        .with("collection", () => setLocalRecentCollections)
        .exhaustive();

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
    recentCollections,
    addRecentItem,
    isRecentsLoading: isRecentsLoading || isRecentlyCreatedDashboardsLoading,
  };
};

/**
 * Deduplicate an array of recent items by id, keeping the first occurrence.
 */
const deduplicateRecentItems = (
  items: SdkIframeEmbedSetupRecentItem[],
): SdkIframeEmbedSetupRecentItem[] => {
  const seenIds = new Set<string | number>();
  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });
};

/**
 * Combine the recent items from the activity log with the
 * recent items that users have chosen in the modal locally.
 */
const getCombinedRecentItems = (
  model: "dashboard" | "card" | "collection",
  localRecentItems: SdkIframeEmbedSetupRecentItem[],
  apiRecentItems: RecentItem[],
): SdkIframeEmbedSetupRecentItem[] => {
  // Deduplicate local items first (e.g., if same item is in both
  // recentlyCreatedDashboards and localRecentDashboards)
  const deduplicatedLocalItems = deduplicateRecentItems(localRecentItems);

  const localRecentItemIds = new Set(
    deduplicatedLocalItems.map((recentItem) => recentItem.id),
  );

  const filteredApiRecentItems = apiRecentItems
    .filter((recentItem) => recentItem.model === model)
    .slice(0, EMBED_RESOURCE_LIST_MAX_RECENTS);

  // If the user has already selected the item which already exists
  // in the activity log, we don't want to show it twice.
  const deduplicatedApiRecentItems = filteredApiRecentItems.filter(
    (recentItem) => !localRecentItemIds.has(recentItem.id),
  );

  return [...deduplicatedLocalItems, ...deduplicatedApiRecentItems].slice(
    0,
    EMBED_RESOURCE_LIST_MAX_RECENTS,
  );
};
