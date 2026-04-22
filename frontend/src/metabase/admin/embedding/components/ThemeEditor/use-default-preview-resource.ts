import { useMemo } from "react";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";

import type { PreviewResource } from "./types";

/**
 * Resolves a default resource to show in the theme preview: the most recently
 * viewed dashboard, falling back to the most recently viewed question. If the
 * user has no recent views (e.g. fresh install), falls back to any existing
 * dashboard, then any existing question.
 */
export function useDefaultPreviewResource(): {
  resource: PreviewResource | null;
  isLoading: boolean;
} {
  const { data: recents, isLoading: isRecentsLoading } = useListRecentsQuery({
    context: ["views"],
  });

  const recentResource = useMemo(() => pickRecentResource(recents), [recents]);

  const shouldFallback = !isRecentsLoading && recentResource == null;

  const { data: dashboards, isLoading: isDashboardLoading } = useSearchQuery(
    { models: ["dashboard"], limit: 1 },
    { skip: !shouldFallback },
  );

  const dashboard = dashboards?.data?.[0];
  const hasDashboard = dashboard != null && typeof dashboard.id === "number";

  const { data: questions, isLoading: isQuestionLoading } = useSearchQuery(
    { models: ["card"], limit: 1 },
    { skip: !shouldFallback || isDashboardLoading || hasDashboard },
  );

  const question = questions?.data?.[0];

  return useMemo(() => {
    if (recentResource) {
      return { resource: recentResource, isLoading: false };
    }

    if (hasDashboard && typeof dashboard.id === "number") {
      return {
        resource: {
          model: "dashboard",
          id: dashboard.id,
          name: dashboard.name,
        },
        isLoading: false,
      };
    }

    if (question && typeof question.id === "number") {
      return {
        resource: {
          model: "card",
          id: question.id,
          name: question.name,
        },
        isLoading: false,
      };
    }

    return {
      resource: null,
      isLoading: isRecentsLoading || isDashboardLoading || isQuestionLoading,
    };
  }, [
    recentResource,
    hasDashboard,
    dashboard,
    question,
    isRecentsLoading,
    isDashboardLoading,
    isQuestionLoading,
  ]);
}

function pickRecentResource(
  recents: { model: string; id: number; name: string }[] | undefined,
): PreviewResource | null {
  if (!recents?.length) {
    return null;
  }

  const dashboard = recents.find((item) => item.model === "dashboard");
  if (dashboard) {
    return { model: "dashboard", id: dashboard.id, name: dashboard.name };
  }

  const card = recents.find((item) => item.model === "card");
  if (card) {
    return { model: "card", id: card.id, name: card.name };
  }

  return null;
}
