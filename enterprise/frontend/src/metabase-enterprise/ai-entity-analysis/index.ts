import { PLUGIN_AI_ANALYSIS, PLUGIN_REDUCERS } from "metabase/plugins";

import { AIDashboardAnalysisButton } from "./components/AIDashboardAnalysisButton";
import { AIQuestionAnalysisButton } from "./components/AIQuestionAnalysisButton";
import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { aiAnalysisReducer } from "./state";

PLUGIN_AI_ANALYSIS.AIQuestionAnalysisButton = AIQuestionAnalysisButton;
PLUGIN_AI_ANALYSIS.AIDashboardAnalysisButton = AIDashboardAnalysisButton;
PLUGIN_AI_ANALYSIS.AIQuestionAnalysisSidebar = AIQuestionAnalysisSidebar;

PLUGIN_REDUCERS.aiAnalysisPlugin = aiAnalysisReducer;

export { AIDashboardAnalysisButton };
export { AIQuestionAnalysisButton };
export { AIQuestionAnalysisSidebar };
