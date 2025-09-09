import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useAnalyzeQuestionUpdate } from "./hooks/use-analyze-question-update";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.useAnalyzeQuestionUpdate = useAnalyzeQuestionUpdate;
}
