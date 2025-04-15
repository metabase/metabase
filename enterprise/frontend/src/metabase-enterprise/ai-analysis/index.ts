import { PLUGIN_AI_ANALYSIS, PLUGIN_REDUCERS } from "metabase/plugins";

import { MetabotExplainButton } from "./components/MetabotExplainButton";
import { MetabotExplainChartButton } from "./components/MetabotExplainChartButton";
import { MetabotExplainDashboardButton } from "./components/MetabotExplainDashboardButton";
import { MetabotExplainSidebar } from "./components/MetabotExplainSidebar";
import { aiAnalysisReducer } from "./state";

PLUGIN_AI_ANALYSIS.ExplainChartButton = MetabotExplainChartButton;
PLUGIN_AI_ANALYSIS.ExplainDashboardButton = MetabotExplainDashboardButton;
PLUGIN_AI_ANALYSIS.ExplainSidebar = MetabotExplainSidebar;

PLUGIN_REDUCERS.aiAnalysisPlugin = aiAnalysisReducer;

export { MetabotExplainButton };
export { MetabotExplainChartButton };
export { MetabotExplainDashboardButton };
export { MetabotExplainSidebar };
