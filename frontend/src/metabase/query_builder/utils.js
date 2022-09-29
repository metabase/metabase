import querystring from "querystring";
import * as Urls from "metabase/lib/urls";
import { serializeCardForUrl } from "metabase/lib/card";

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

export function getURLForCardState({ card }, dirty, query = {}, objectId) {
  const options = {
    hash: card && dirty ? serializeCardForUrl(card) : "",
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
