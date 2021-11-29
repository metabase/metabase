import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";

export function isAdHocDatasetQuestion(question, originalQuestion) {
  if (!originalQuestion || !question.isStructured()) {
    return false;
  }

  const isDataset = question.isDataset() || originalQuestion.isDataset();
  const isSameCard = question.id() === originalQuestion.id();
  const isSelfReferencing =
    question.query().sourceTableId() ===
    getQuestionVirtualTableId(originalQuestion.card());

  return isDataset && isSameCard && isSelfReferencing;
}
