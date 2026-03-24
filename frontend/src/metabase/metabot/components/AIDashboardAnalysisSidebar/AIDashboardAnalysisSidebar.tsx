import { t } from "ttag";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import { getIsDashCardsLoadingComplete } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";

import { useDashCardAnalysis } from "../../hooks/useDashCardAnalysis";
import { AIAnalysisContentWrapper } from "../AIAnalysisContentWrapper/AIAnalysisContentWrapper";

export function AIDashboardAnalysisSidebar() {
  const { sidebar, closeSidebar } = useDashboardContext();
  const dashcardId = sidebar.props?.dashcardId;
  const isDashCardsLoadingComplete = useSelector(getIsDashCardsLoadingComplete);

  const dashcards = useSelector((state) => state.dashboard.dashcards);
  const dashcard = dashcardId ? dashcards[dashcardId] : null;
  const card = dashcard?.card;

  const { analysisData, isLoading } = useDashCardAnalysis({
    dashcardId,
    name: card?.name,
    description: card?.description,
    isLoadingComplete: isDashCardsLoadingComplete,
    isEnabled: !!dashcardId,
  });

  return (
    <Sidebar data-testid="dashboard-analysis-sidebar">
      <AIAnalysisContentWrapper
        title={t`Explain this chart`}
        explanation={analysisData}
        isLoading={isLoading}
        onClose={closeSidebar}
      />
    </Sidebar>
  );
}
