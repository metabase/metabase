import querystring from "querystring";

import type { Location } from "history";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, Field, Series } from "metabase-types/api";
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
      ? window.location.search.slice(1)
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
    hash:
      card && dirty
        ? Question.serializeCardForUrl(card, {
            includeOriginalCardId: true,
            includeDatasetQuery: true,
            includeDisplayIsLocked: true,
          })
        : "",
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

  const { isNative } = Lib.queryDisplayInfo(question.query());
  const validSlugs = [question.id(), question.slug()]
    .filter(Boolean)
    .map(String);

  if (question.type() === "model") {
    const isRunningModel = pathname === "/model" && hash.length > 0;
    const allowedPathnames = isNewQuestion
      ? ["/model/query", "/model/columns", "/model/metadata"]
      : validSlugs.flatMap((slug) => [
          `/model/${slug}/query`,
          `/model/${slug}/columns`,
          `/model/${slug}/notebook`,
          `/model/${slug}/metadata`,
        ]);

    return isRunningModel || allowedPathnames.includes(pathname);
  }

  if (question.type() === "metric") {
    const isRunningMetric = pathname === "/metric" && hash.length > 0;
    const allowedPathnames = isNewQuestion
      ? ["/metric/query"]
      : validSlugs.flatMap((slug) => [
          `/metric/${slug}/query`,
          `/metric/${slug}/notebook`,
        ]);

    return isRunningMetric || allowedPathnames.includes(pathname);
  }

  if (isNative) {
    const allowedPathnames = [
      ...validSlugs.map((slug) => `/question/${slug}`),
      "/question",
    ];
    const isRunningQuestion =
      allowedPathnames.includes(pathname) && hash.length > 0;

    return isRunningQuestion;
  }

  /**
   * New structured questions will be handled in
   * https://github.com/metabase/metabase/issues/34686
   */
  if (!isNewQuestion) {
    const isRunningQuestion =
      ["/question", "/question/notebook"].includes(pathname) && hash.length > 0;
    const allowedPathnames = validSlugs.flatMap((slug) => [
      `/question/${slug}`,
      `/question/${slug}/notebook`,
    ]);

    return isRunningQuestion || allowedPathnames.includes(pathname);
  }

  return true;
};

export const createRawSeries = (options: {
  card: Card;
  queryResult: any;
  datasetQuery?: any;
}): Series => {
  const { card, queryResult, datasetQuery } = options;

  // we want to provide the visualization with a card containing the latest
  // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
  // BUT the last executed "dataset_query" (to ensure data matches the query)
  return (
    queryResult && [
      {
        ...queryResult,
        card: {
          ...card,
          ...(datasetQuery && { dataset_query: datasetQuery }),
        },
      },
    ]
  );
};

const WRITABLE_MBQL_COLUMN_PROPERTIES = [
  "display_name",
  "description",
  "semantic_type",
  "fk_target_field_id",
  "visibility_type",
  "settings",
];

const WRITABLE_NATIVE_COLUMN_PROPERTIES = [
  "id",
  ...WRITABLE_MBQL_COLUMN_PROPERTIES,
];

export function getWritableColumnProperties(column: Field, isNative: boolean) {
  return _.pick(
    column,
    isNative
      ? WRITABLE_NATIVE_COLUMN_PROPERTIES
      : WRITABLE_MBQL_COLUMN_PROPERTIES,
  );
}
