import { isSupportedTemplateTagForModel } from "metabase/lib/data-modeling/utils";
import { getQuestionVirtualTableId } from "metabase/lib/saved-questions";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

// Query Builder Mode

export function getQueryBuilderModeFromLocation(location) {
  const { pathname } = location;
  if (pathname.endsWith("/notebook")) {
    return {
      mode: "notebook",
    };
  }
  if (pathname.endsWith("/query") || pathname.endsWith("/metadata")) {
    return {
      mode: "dataset",
      datasetEditorTab: pathname.endsWith("/query") ? "query" : "metadata",
    };
  }
  return {
    mode: "view",
  };
}

export function getPathNameFromQueryBuilderMode({
  pathname,
  queryBuilderMode,
  datasetEditorTab = "query",
}) {
  if (queryBuilderMode === "view") {
    return pathname;
  }
  if (queryBuilderMode === "dataset") {
    return `${pathname}/${datasetEditorTab}`;
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
    ? query.templateTagsWithoutSnippets()
    : [];
}

export function getNextTemplateTagVisibilityState({
  oldQuestion,
  newQuestion,
  isTemplateTagEditorVisible,
  queryBuilderMode,
}) {
  const previousTags = getTemplateTagWithoutSnippetsCount(oldQuestion);
  const nextTags = getTemplateTagWithoutSnippetsCount(newQuestion);

  if (nextTags.length > previousTags.length) {
    if (queryBuilderMode !== "dataset") {
      return "visible";
    }
    return nextTags.every(isSupportedTemplateTagForModel)
      ? "visible"
      : "hidden";
  }

  if (nextTags.length === 0 && isTemplateTagEditorVisible) {
    return "hidden";
  }

  return "deferToCurrentState";
}
