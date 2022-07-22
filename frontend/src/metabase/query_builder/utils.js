import querystring from "querystring";
import { isSupportedTemplateTagForModel } from "metabase/lib/data-modeling/utils";
import * as Urls from "metabase/lib/urls";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

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

export function getCurrentQueryParams() {
  const search =
    window.location.search.charAt(0) === "?"
      ? window.location.search.slice(0)
      : window.location.search;
  return querystring.parse(search);
}

export function getURLForCardState(
  { card, serializedCard },
  dirty,
  query = {},
  objectId,
) {
  const options = {
    hash: serializedCard && dirty ? serializedCard : "",
    query,
  };
  const isAdHocQuestion = !card.id;
  if (objectId != null) {
    if (isAdHocQuestion) {
      options.query.objectId = objectId;
    } else {
      options.objectId = objectId;
    }
  }
  return Urls.question(card, options);
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
