import { PLUGIN_AI_ENTITY_ANALYSIS } from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";

import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { canAnalyzeQuestion } from "./utils";

PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
PLUGIN_AI_ENTITY_ANALYSIS.AIQuestionAnalysisSidebar = AIQuestionAnalysisSidebar;

PLUGIN_AI_ENTITY_ANALYSIS.canAnalyzeQuestion = (question: Question) => {
  return canAnalyzeQuestion(question.card().display);
};

export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
