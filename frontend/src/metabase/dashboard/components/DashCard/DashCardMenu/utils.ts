import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const canEditQuestion = (question: Question) => {
  // question.query() is an expensive call, short circuit when possible
  if (!question.canWrite()) {
    return false;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  return isEditable;
};
