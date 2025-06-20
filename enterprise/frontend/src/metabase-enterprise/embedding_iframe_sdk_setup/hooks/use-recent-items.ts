import { useMemo, useState } from "react";

import { useListRecentsQuery } from "metabase/api";
import type { RecentItem } from "metabase-types/api";

import type { SdkIframeEmbedSetupRecentItem } from "../types";

const MAX_RECENTS = 6;

export const useRecentItems = () => {
  const { data: recentItems, isLoading } = useListRecentsQuery(
    { context: ["views", "selections"] },
    { refetchOnMountOrArgChange: true },
  );

  const [localRecentDashboards, setLocalRecentDashboards] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  const [localRecentQuestions, setLocalRecentQuestions] = useState<
    SdkIframeEmbedSetupRecentItem[]
  >([]);

  // Filter and merge API recent items with local selections
  const recentDashboards = useMemo(() => {
    const apiDashboards = (recentItems || [])
      .filter((item): item is RecentItem => item.model === "dashboard")
      .slice(0, MAX_RECENTS);

    // Merge local selections with API items, prioritizing local
    const localIds = new Set(localRecentDashboards.map((d) => d.id));

    const mergedItems = [
      ...localRecentDashboards,
      ...apiDashboards.filter((d) => !localIds.has(d.id)),
    ].slice(0, MAX_RECENTS);

    return mergedItems;
  }, [recentItems, localRecentDashboards]);

  const recentQuestions = useMemo(() => {
    const apiQuestions = (recentItems || [])
      .filter((item): item is RecentItem => item.model === "card")
      .slice(0, 5);

    // Merge local selections with API items, prioritizing local
    const localIds = new Set(localRecentQuestions.map((q) => q.id));

    const mergedItems = [
      ...localRecentQuestions,
      ...apiQuestions.filter((q) => !localIds.has(q.id)),
    ].slice(0, 5);

    return mergedItems;
  }, [recentItems, localRecentQuestions]);

  const addRecentItem = (
    type: "dashboard" | "question",
    item: SdkIframeEmbedSetupRecentItem,
  ) => {
    if (type === "dashboard") {
      setLocalRecentDashboards((prev) => {
        const filtered = prev.filter((d) => d.id !== item.id);

        return [item, ...filtered].slice(0, MAX_RECENTS);
      });
    }

    if (type === "question") {
      setLocalRecentQuestions((prev) => {
        const filtered = prev.filter((q) => q.id !== item.id);

        return [item, ...filtered].slice(0, MAX_RECENTS);
      });
    }
  };

  return {
    recentDashboards,
    recentQuestions,
    addRecentItem,
    isRecentsLoading: isLoading,
  };
};
