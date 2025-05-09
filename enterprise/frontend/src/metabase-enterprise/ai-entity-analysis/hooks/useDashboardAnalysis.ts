import { useEffect, useRef } from "react";

import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { getDashboardImage } from "metabase/visualizations/lib/image-exports";
import type { Dashboard } from "metabase-types/api";

import { useAnalyzeDashboardMutation } from "../../api/ai-entity-analysis";

// Delay time to ensure visualizations have rendered after data loading
const RENDER_DELAY_MS = 200;

interface UseDashboardAnalysisOptions {
  dashboard: Dashboard;
  isDashCardsLoadingComplete: boolean;
  selectedTabId?: string | number;
  isEnabled?: boolean;
}

export function useDashboardAnalysis({
  dashboard,
  isDashCardsLoadingComplete,
  selectedTabId,
  isEnabled = true,
}: UseDashboardAnalysisOptions) {
  const [analyzeDashboard, { data: analysisData, isLoading }] =
    useAnalyzeDashboardMutation();
  const pendingAnalysisRef = useRef(true);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      !isEnabled ||
      !pendingAnalysisRef.current ||
      !isDashCardsLoadingComplete
    ) {
      return;
    }

    analysisTimeoutRef.current = setTimeout(async () => {
      const dashboardSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
      const imageBase64 = await getDashboardImage(dashboardSelector);

      if (imageBase64) {
        await analyzeDashboard({
          imageBase64,
          name: dashboard.name,
          description: dashboard.description ?? undefined,
          tabName:
            dashboard.tabs?.find(
              (tab) => String(tab.id) === String(selectedTabId),
            )?.name ?? undefined,
        });
      }

      pendingAnalysisRef.current = false;
      analysisTimeoutRef.current = null;
    }, RENDER_DELAY_MS);

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
    };
  }, [
    analyzeDashboard,
    dashboard,
    isDashCardsLoadingComplete,
    selectedTabId,
    isEnabled,
  ]);

  return {
    analysisData: analysisData?.summary,
    isLoading:
      isLoading ||
      (isEnabled && isDashCardsLoadingComplete && pendingAnalysisRef.current),
    reloadAnalysis: () => {
      pendingAnalysisRef.current = true;
    },
  };
}
