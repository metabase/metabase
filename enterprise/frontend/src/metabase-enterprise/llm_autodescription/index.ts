import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";

import { useLLMIndicator } from "./use-llm-question-name-description";
import { useLLMDashboardDescription } from "./use-llm-dashboard-description";

if (hasPremiumFeature("llm_autodescription")) {
  PLUGIN_LLM_AUTODESCRIPTION.useLLMDashboardDescription =
    useLLMDashboardDescription;
  PLUGIN_LLM_AUTODESCRIPTION.useLLMQuestionTitleAndDescription =
    useLLMIndicator;
}
