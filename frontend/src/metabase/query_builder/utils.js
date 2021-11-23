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

export function toAdHocDatasetQuestionCard(card, originalCard) {
  return {
    ...card,
    dataset_query: {
      ...originalCard.dataset_query,
      query: {
        "source-table": getQuestionVirtualTableId(originalCard),
      },
    },
  };
}

export function toAdHocDatasetQuestion(question, originalQuestion) {
  return question.setDatasetQuery({
    ...originalQuestion.datasetQuery(),
    query: {
      "source-table": getQuestionVirtualTableId(originalQuestion.card()),
    },
  });
}
