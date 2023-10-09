import type { Location } from "history";
import querystring from "querystring";
import * as Urls from "metabase/lib/urls";
import { serializeCardForUrl } from "metabase/lib/card";
import type { Card } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";
import type Question from "metabase-lib/Question";

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

export const isNavigationAllowed = ({
  destination,
  question,
  isNewQuestion,
}: {
  destination: Location | undefined;
  question: Question | undefined;
  isNewQuestion: boolean;
}) => {
  /**
   * If there is no "question" there is no reason to prevent navigation.
   * If there is no "destination" then it's beforeunload event, which is
   * handled by useBeforeUnload hook - no reason to duplicate its work.
   *
   * If it's a new question, we're going to deal with it later as part of the epic:
   * https://github.com/metabase/metabase/issues/33749
   */
  if (!question || !destination || isNewQuestion) {
    return true;
  }

  const { hash, pathname } = destination;

  if (question.isDataset()) {
    const isGoingToQueryTab =
      pathname.startsWith("/model/") && pathname.endsWith("/query");
    const isGoingToMetadataTab =
      pathname.startsWith("/model/") && pathname.endsWith("/metadata");

    return isGoingToQueryTab || isGoingToMetadataTab;
  }

  if (question.isNative()) {
    const isRunningQuestion = pathname === "/question" && hash.length > 0;

    return isRunningQuestion;
  }

  return true;
};
