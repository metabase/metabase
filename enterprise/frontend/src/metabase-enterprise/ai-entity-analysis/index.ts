import { PLUGIN_AI_ANALYSIS, PLUGIN_REDUCERS } from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import { AIDashboardAnalysisButton } from "./components/AIDashboardAnalysisButton";
import { AIDashboardAnalysisSidebar } from "./components/AIDashboardAnalysisSidebar/AIDashboardAnalysisSidebar";
import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { aiAnalysisReducer } from "./state";
import { canAnalyzeQuestion } from "./utils";

PLUGIN_AI_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
PLUGIN_AI_ANALYSIS.AIDashboardAnalysisButton = AIDashboardAnalysisButton;
PLUGIN_AI_ANALYSIS.AIQuestionAnalysisSidebar = AIQuestionAnalysisSidebar;
PLUGIN_AI_ANALYSIS.AIDashboardAnalysisSidebar = AIDashboardAnalysisSidebar;

PLUGIN_AI_ANALYSIS.canAnalyzeQuestion = (question: Question) => {
  return canAnalyzeQuestion(question.card().display);
};

PLUGIN_AI_ANALYSIS.canAnalyzeDashboard = (dashboard: Dashboard) => {
  return dashboard.dashcards.some((dashcard) =>
    canAnalyzeQuestion(dashcard.card.display),
  );
};

PLUGIN_REDUCERS.aiAnalysisPlugin = aiAnalysisReducer;

export { AIDashboardAnalysisButton };
export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
