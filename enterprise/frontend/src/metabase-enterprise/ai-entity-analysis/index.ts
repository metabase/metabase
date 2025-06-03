import { t } from "ttag";

import {
  PLUGIN_AI_ENTITY_ANALYSIS,
  PLUGIN_DASHCARD_MENU,
} from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";

import { showDashCardAnalysisSidebar } from "./actions";
import { AIDashboardAnalysisSidebar } from "./components/AIDashboardAnalysisSidebar/AIDashboardAnalysisSidebar";
import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { canAnalyzeQuestion } from "./utils";

PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar = AIQuestionAnalysisSidebar;
PLUGIN_AI_ENTITY_ANALYSIS.AIDashboardAnalysisSidebar =
  AIDashboardAnalysisSidebar;

PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion = (question: Question) => {
  return canAnalyzeQuestion(question.card().display);
};

PLUGIN_DASHCARD_MENU.dashcardMenuItemGetters.push(
  (question, dashcardId, dispatch) => {
    if (!PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion(question)) {
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

export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
