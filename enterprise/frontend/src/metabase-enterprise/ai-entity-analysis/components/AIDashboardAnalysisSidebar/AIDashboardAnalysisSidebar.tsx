import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import {
  getIsDashCardsLoadingComplete,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import type { AIDashboardAnalysisSidebarProps } from "metabase/plugins";

import { useDashCardAnalysis } from "../../hooks/useDashCardAnalysis";
import { useDashboardAnalysis } from "../../hooks/useDashboardAnalysis";
import { AIAnalysisContentWrapper } from "../AIAnalysisContentWrapper/AIAnalysisContentWrapper";

export function AIDashboardAnalysisSidebar({
  dashboard,
  onClose,
  dashcardId,
}: AIDashboardAnalysisSidebarProps) {
  const isDashCardsLoadingComplete = useSelector(getIsDashCardsLoadingComplete);
  const parameterValues = useSelector(getParameterValues);
  const selectedTabId = useSelector((state) => state.dashboard.selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);
  const previousTabId = usePrevious(selectedTabId);

  const dashcards = useSelector((state) => state.dashboard.dashcards);
  const dashcard = dashcardId ? dashcards[dashcardId] : null;
  const card = dashcard?.card;

  const isDashboardMode = !dashcardId || !dashcard || !card;

  const {
    analysisData: dashboardAnalysisData,
    isLoading: isDashboardLoading,
    reloadAnalysis: reloadDashboardAnalysis,
  } = useDashboardAnalysis({
    dashboard,
    isDashCardsLoadingComplete,
    selectedTabId: selectedTabId || undefined,
    isEnabled: isDashboardMode,
  });

  const { analysisData: dashcardAnalysisData, isLoading: isDashcardLoading } =
    useDashCardAnalysis({
      dashcardId,
      name: card?.name,
      description: card?.description,
      isLoadingComplete: isDashCardsLoadingComplete,
      isEnabled: !isDashboardMode,
    });

  // Update analysis when dashboard tab changes
  useEffect(() => {
    if (!isDashboardMode) {
      return;
    }

    if (previousTabId !== undefined && selectedTabId !== previousTabId) {
      reloadDashboardAnalysis();
    }
  }, [isDashboardMode, selectedTabId, previousTabId, reloadDashboardAnalysis]);

  // Update analysis when dashboard parameters change
  useEffect(() => {
    if (!isDashboardMode || !previousParameterValues) {
      return;
    }

    const hasParameterValuesChanged = !_.isEqual(
      parameterValues,
      previousParameterValues,
    );

    if (hasParameterValuesChanged) {
      reloadDashboardAnalysis();
    }
  }, [
    isDashboardMode,
    parameterValues,
    previousParameterValues,
    reloadDashboardAnalysis,
  ]);

  const analysisData = isDashboardMode
    ? dashboardAnalysisData
    : dashcardAnalysisData;

  const isLoading = isDashboardMode ? isDashboardLoading : isDashcardLoading;

  const title = isDashboardMode
    ? t`Explain this dashboard`
    : t`Explain this chart`;

  return (
    <Sidebar data-testid="dashboard-analysis-sidebar">
      <AIAnalysisContentWrapper
        title={title}
        explanation={analysisData}
        isLoading={isLoading}
        onClose={onClose}
      />
    </Sidebar>
  );
}
