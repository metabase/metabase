import { t } from "ttag";

import { Sidebar } from "metabase/common/components/Sidebar";
import { AIAnalysisContentWrapper } from "metabase/metabot/components/AIAnalysisContentWrapper/AIAnalysisContentWrapper";
import { useDashCardAnalysis } from "metabase/metabot/hooks/useDashCardAnalysis";
import { useSelector } from "metabase/redux";

import { useDashboardContext } from "../../context";
import { getIsDashCardsLoadingComplete } from "../../selectors";

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
