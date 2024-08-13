import type { Location } from "history";
import querystring from "querystring";
import _ from "underscore";

import { serializeCardForUrl } from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
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

  const { isNative } = Lib.queryDisplayInfo(question.query());
  const validSlugs = [question.id(), question.slug()]
    .filter(Boolean)
    .map(String);

  if (question.type() === "model") {
    const isRunningModel = pathname === "/model" && hash.length > 0;
    const allowedPathnames = isNewQuestion
      ? ["/model/query", "/model/metadata"]
      : validSlugs.flatMap(slug => [
          `/model/${slug}`,
          `/model/${slug}/query`,
          `/model/${slug}/metadata`,
          `/model/${slug}/notebook`,
        ]);

    return isRunningModel || allowedPathnames.includes(pathname);
  }

  if (question.type() === "metric") {
    const isRunningMetric = pathname === "/metric" && hash.length > 0;
    const allowedPathnames = isNewQuestion
      ? ["/metric/query", "/metric/metadata"]
      : validSlugs.flatMap(slug => [
          `/metric/${slug}`,
          `/metric/${slug}/query`,
          `/metric/${slug}/metadata`,
          `/metric/${slug}/notebook`,
        ]);

    return isRunningMetric || allowedPathnames.includes(pathname);
  }

  if (isNative) {
    const allowedPathnames = [
      ...validSlugs.map(slug => `/question/${slug}`),
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
    const allowedPathnames = validSlugs.flatMap(slug => [
      `/question/${slug}`,
      `/question/${slug}/notebook`,
    ]);

    return isRunningQuestion || allowedPathnames.includes(pathname);
  }

  return true;
};

export const createRawSeries = (options: {
  question: Question;
  queryResult: any;
  datasetQuery?: any;
}): Series => {
  const { question, queryResult, datasetQuery } = options;

  // we want to provide the visualization with a card containing the latest
  // "display", "visualization_settings", etc, (to ensure the correct visualization is shown)
  // BUT the last executed "dataset_query" (to ensure data matches the query)
  return (
    queryResult && [
      {
        card: {
          ...question.card(),
          ...(datasetQuery && { dataset_query: datasetQuery }),
        },
        data: queryResult && queryResult.data,
      },
    ]
  );
};

const WRITABLE_COLUMN_PROPERTIES = [
  "id",
  "display_name",
  "description",
  "semantic_type",
  "fk_target_field_id",
  "visibility_type",
  "settings",
];

export function getWritableColumnProperties(column: Field) {
  return _.pick(column, WRITABLE_COLUMN_PROPERTIES);
}
