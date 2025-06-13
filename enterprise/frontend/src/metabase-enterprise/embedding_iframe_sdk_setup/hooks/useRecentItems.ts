import { useMemo, useState } from "react";

import { useListRecentsQuery } from "metabase/api";
import type { RecentItem } from "metabase-types/api";

export type RecentDashboard = {
  id: number;
  name: string;
  description?: string | null;
  updatedAt?: string;
};

export type RecentQuestion = {
  id: number;
  name: string;
  description?: string | null;
  updatedAt?: string;
};

const MAX_RECENTS = 6;

export const useRecentItems = () => {
  const { data: recentItems } = useListRecentsQuery(
    { context: ["views", "selections"] },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const [localRecentDashboards, setLocalRecentDashboards] = useState<
    RecentDashboard[]
  >([]);
  const [localRecentQuestions, setLocalRecentQuestions] = useState<
    RecentQuestion[]
  >([]);

  // Filter and merge API recent items with local selections
  const recentDashboards = useMemo(() => {
    const apiDashboards = (recentItems || [])
      .filter((item): item is RecentItem => item.model === "dashboard")
      .map(
        (item): RecentDashboard => ({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          updatedAt: item.timestamp,
        }),
      )
      .slice(0, MAX_RECENTS);

    // Merge local selections with API items, prioritizing local (more recent)
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
      .map(
        (item): RecentQuestion => ({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          updatedAt: item.timestamp,
        }),
      )
      .slice(0, 5);

    // Merge local selections with API items, prioritizing local (more recent)
    const localIds = new Set(localRecentQuestions.map((q) => q.id));

    const mergedItems = [
      ...localRecentQuestions,
      ...apiQuestions.filter((q) => !localIds.has(q.id)),
    ].slice(0, 5);

    return mergedItems;
  }, [recentItems, localRecentQuestions]);

  const addRecentDashboard = (dashboard: RecentDashboard) => {
    setLocalRecentDashboards((prev) => {
      const filtered = prev.filter((d) => d.id !== dashboard.id);

      return [dashboard, ...filtered].slice(0, MAX_RECENTS);
    });
  };

  const addRecentQuestion = (question: RecentQuestion) => {
    setLocalRecentQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== question.id);

      return [question, ...filtered].slice(0, MAX_RECENTS);
    });
  };

  return {
    recentDashboards,
    recentQuestions,
    addRecentDashboard,
    addRecentQuestion,
  };
};
