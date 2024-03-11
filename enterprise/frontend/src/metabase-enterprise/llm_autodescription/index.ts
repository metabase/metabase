import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LLMSuggestQuestionInfo } from "./LLMSuggestQuestionInfo";

if (hasPremiumFeature("llm_autodescription")) {
  PLUGIN_LLM_AUTODESCRIPTION.isEnabled = () => true;
  PLUGIN_LLM_AUTODESCRIPTION.LLMSuggestQuestionInfo = LLMSuggestQuestionInfo;
}
