import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

export const canEditQuestion = (question: Question) => {
  // question.query() is an expensive call, short circuit when possible
  if (!question.canWrite()) {
    return false;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  return isEditable;
};

export const canDownloadResults = (result?: Dataset) => {
  return (
    !!result?.data &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};
