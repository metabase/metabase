import { t } from "ttag";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AnalyzeConfirmForm } from "./components/AnalyzeConfirmForm";
import { useAnalyzeQuestionUpdate } from "./hooks/use-analyze-question-update";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.AnalyzeConfirmForm = AnalyzeConfirmForm;
  PLUGIN_DEPENDENCIES.useAnalyzeQuestionUpdate = useAnalyzeQuestionUpdate;
  PLUGIN_DEPENDENCIES.getAnalyzeConfirmTitle = () =>
    t`These changes will break some other things. Save anyway?`;
}
