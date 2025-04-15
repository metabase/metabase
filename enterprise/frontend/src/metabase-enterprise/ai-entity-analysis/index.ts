import { PLUGIN_AI_ANALYSIS, PLUGIN_REDUCERS } from "metabase/plugins";

import { AIQuestionAnalysisSidebar } from "./components/AIQuestionAnalysisSidebar";
import { MetabotExplainChartButton } from "./components/MetabotExplainChartButton";
import { MetabotExplainDashboardButton } from "./components/MetabotExplainDashboardButton";
import { aiAnalysisReducer } from "./state";

PLUGIN_AI_ANALYSIS.ExplainChartButton = MetabotExplainChartButton;
PLUGIN_AI_ANALYSIS.ExplainDashboardButton = MetabotExplainDashboardButton;
PLUGIN_AI_ANALYSIS.ExplainSidebar = AIQuestionAnalysisSidebar;

PLUGIN_REDUCERS.aiAnalysisPlugin = aiAnalysisReducer;

export { AIQuestionAnalysisSidebar };
export { MetabotExplainChartButton };
export { MetabotExplainDashboardButton };
