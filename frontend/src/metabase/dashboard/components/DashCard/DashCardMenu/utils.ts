import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

export const canEditQuestion = (question: Question) => {
  return question.canWrite() && question.canRunAdhocQuery();
};

export const canDownloadResults = (result?: Dataset) => {
  return (
    result != null &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};
