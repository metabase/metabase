import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";

import type { PreviewResource } from "./types";

/**
 * Resolves a default resource to show in the theme preview: the most recently
 * viewed dashboard, falling back to the most recently viewed question if no
 * dashboards exist.
 */
export function useDefaultPreviewResource(): {
  resource: PreviewResource | null;
  isLoading: boolean;
} {
  const { data: dashboards, isLoading: isDashboardLoading } = useSearchQuery({
    models: ["dashboard"],
    limit: 1,
  });

  const dashboard = dashboards?.data?.[0];
  const hasDashboard = dashboard != null && typeof dashboard.id === "number";

  const { data: questions, isLoading: isQuestionLoading } = useSearchQuery(
    { models: ["card"], limit: 1 },
    { skip: isDashboardLoading || hasDashboard },
  );

  const question = questions?.data?.[0];

  return useMemo(() => {
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
      isLoading: isDashboardLoading || isQuestionLoading,
    };
  }, [
    hasDashboard,
    dashboard,
    question,
    isDashboardLoading,
    isQuestionLoading,
  ]);
}
