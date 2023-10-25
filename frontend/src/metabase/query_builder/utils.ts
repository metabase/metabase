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
   */
  if (!question || !destination) {
    return true;
  }

  const { hash, pathname } = destination;

  const runModelPathnames = question.isStructured()
    ? ["/model", "/model/notebook"]
    : ["/model"];
  const isRunningModel =
    runModelPathnames.includes(pathname) && hash.length > 0;
  const validSlugs = [question.id(), question.slug()]
    .filter(Boolean)
    .map(String);

  if (question.isDataset()) {
    if (isNewQuestion) {
      const allowedPathnames = ["/model/query", "/model/metadata"];
      return isRunningModel || allowedPathnames.includes(pathname);
    }

    const allowedPathnames = validSlugs.flatMap(slug => [
      `/model/${slug}`,
      `/model/${slug}/query`,
      `/model/${slug}/metadata`,
    ]);

    return isRunningModel || allowedPathnames.includes(pathname);
  }

  if (question.isNative()) {
    const isRunningQuestion = pathname === "/question" && hash.length > 0;
    return isRunningQuestion;
  }

  /**
   * New structured questions will be handled in
   * https://github.com/metabase/metabase/issues/34686
   */
  if (!isNewQuestion && question.isStructured()) {
    const isRunningQuestion =
      ["/question", "/question/notebook"].includes(pathname) && hash.length > 0;
    const allowedPathnames = validSlugs.flatMap(slug => [
      `/question/${slug}`,
      `/question/${slug}/notebook`,
    ]);

    return (
      isRunningModel || isRunningQuestion || allowedPathnames.includes(pathname)
    );
  }

  return true;
};
