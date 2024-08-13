import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isAdHocModelQuestion } from "metabase-lib/v1/metadata/utils/models";

export function isQuestionDirty(
  question: Question,
  originalQuestion: Question,
) {
  // When viewing a dataset, its dataset_query is swapped with a clean query using the dataset as a source table
  // (it's necessary for datasets to behave like tables opened in simple mode)
  // We need to escape the isDirty check as it will always be true in this case,
  // and the page will always be covered with a 'rerun' overlay.
  // Once the dataset_query changes, the question will loose the "dataset" flag and it'll work normally
  if (!question || isAdHocModelQuestion(question, originalQuestion)) {
    return false;
  }

  return question.isDirtyComparedToWithoutParameters(originalQuestion);
}

export function isQuestionRunnable(question: Question, isDirty: boolean) {
  if (!question) {
    return false;
  }

  if (!question.isSaved() || isDirty) {
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    return question.canRun() && isEditable;
  }

  return question.canRun();
}
