import querystring from "querystring";
import * as Urls from "metabase/lib/urls";
import { serializeCardForUrl } from "metabase/lib/card";
import type { Card } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

interface GetPathNameFromQueryBuilderModeOptions {
  pathname: string;
  queryBuilderMode: QueryBuilderMode;
  datasetEditorTab?: DatasetEditorTab;
}
export function getPathNameFromQueryBuilderMode({
  pathname,
  queryBuilderMode,
  datasetEditorTab = "query",
}: GetPathNameFromQueryBuilderModeOptions) {
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

type QueryParams = ReturnType<typeof getCurrentQueryParams>;
export function getURLForCardState(
  { card }: { card: Card },
  dirty: boolean,
  query: QueryParams = {},
  objectId: string,
) {
  interface Options {
    hash: string;
    query: QueryParams;
    objectId?: string;
  }
  const options: Options = {
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
