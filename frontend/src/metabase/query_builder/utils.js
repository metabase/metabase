import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

// Query Builder Mode

export function getQueryBuilderModeFromLocation(location) {
  const { pathname } = location;
  if (pathname.endsWith("/notebook")) {
    return "notebook";
  }
  if (pathname.endsWith("/query")) {
    return "dataset";
  }
  return "view";
}

export function getPathNameFromQueryBuilderMode({
  pathname,
  queryBuilderMode,
}) {
  if (queryBuilderMode === "view") {
    return pathname;
  }
  if (queryBuilderMode === "dataset") {
    return `${pathname}/query`;
  }
  return `${pathname}/${queryBuilderMode}`;
}

// Datasets

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

function getTemplateTagWithoutSnippetsCount(question) {
  const query = question.query();
  return query instanceof NativeQuery
    ? query.templateTagsWithoutSnippets().length
    : 0;
}

export function getNextTemplateTagVisibilityState({
  oldQuestion,
  newQuestion,
  isTemplateTagEditorVisible,
}) {
  const oldCount = getTemplateTagWithoutSnippetsCount(oldQuestion);
  const newCount = getTemplateTagWithoutSnippetsCount(newQuestion);
  if (newCount > oldCount) {
    return true;
  }
  if (newCount === 0 && isTemplateTagEditorVisible) {
    return false;
  }
}
