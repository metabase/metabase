import { t } from "ttag";

import {
  PLUGIN_AI_ENTITY_ANALYSIS,
  PLUGIN_DASHCARD_MENU,
} from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import { showDashCardAnalysisSidebar } from "./actions";
import { AIDashboardAnalysisButton } from "./components/AIDashboardAnalysisButton";
import { AIDashboardAnalysisSidebar } from "./components/AIDashboardAnalysisSidebar/AIDashboardAnalysisSidebar";
import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { canAnalyzeQuestion } from "./utils";

PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
PLUGIN_AI_ENTITY_ANALYSIS.AIDashboardAnalysisButton = AIDashboardAnalysisButton;
PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar = AIQuestionAnalysisSidebar;
PLUGIN_AI_ENTITY_ANALYSIS.AIDashboardAnalysisSidebar =
  AIDashboardAnalysisSidebar;

PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion = (question: Question) => {
  return canAnalyzeQuestion(question.card().display);
};

PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeDashboard = (dashboard: Dashboard) => {
  return dashboard.dashcards.some((dashcard) =>
    canAnalyzeQuestion(dashcard.card.display),
  );
};

PLUGIN_DASHCARD_MENU.dashcardMenuItemGetters.push(
  (question, dashcardId, dispatch, { withMetabot } = {}) => {
    if (
      withMetabot === false ||
      !PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question)
    ) {
      return null;
    }

    return {
      key: "MB_ANALYZE_CHART",
      iconName: "metabot",
      label: t`Analyze chart`,
      onClick: () => {
        if (dashcardId != null) {
          dispatch(showDashCardAnalysisSidebar(dashcardId));
        }
      },
    };
  },
);

export { AIDashboardAnalysisButton };
export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
