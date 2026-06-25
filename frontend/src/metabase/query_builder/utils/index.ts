import querystring from "querystring";

import type { Location } from "history";
import _ from "underscore";

import { serializeCardForUrl } from "metabase/common/utils/card";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, Field, NormalizedField } from "metabase-types/api";

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
  const options: Urls.CardUrlBuilderParams = {
    hash:
      card && dirty
        ? serializeCardForUrl(card, {
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
      (options.query as QueryParams).objectId = objectId;
    } else {
      options.objectId = objectId;
    }
  }
  return Urls.card(card, options);
}

/**
 * The clean `/table/:slug` URL (e.g. /table/2-orders) for a question that is
 * still the pristine, unmodified default view of a table — otherwise `null`.
 *
 * This is what lets the QB show the canonical table URL on entry and fall back
 * to the `/question#<hash>` form (via {@link getURLForCardState}) the moment the
 * question is edited away from the table's default.
 */
export function getTableUrlForPristineQuestion(
  question: Question,
): string | null {
  if (question.isSaved()) {
    return null;
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative || Lib.stageCount(query) !== 1) {
    return null;
  }

  // A card source (`card__123`) is a string id; only a real table qualifies.
  const sourceTableId = Lib.sourceTableOrCardId(query);
  if (typeof sourceTableId !== "number") {
    return null;
  }

  const table = question.metadata().table(sourceTableId);
  if (!table) {
    return null;
  }

  const card = question.card();
  const defaultCard = table.newQuestion().card();
  const isPristine =
    Lib.areLegacyQueriesEqual(card.dataset_query, defaultCard.dataset_query) &&
    card.display === defaultCard.display &&
    _.isEmpty(card.visualization_settings) &&
    question.parameters().length === 0;

  return isPristine
    ? Urls.table({ id: sourceTableId, name: table.display_name })
    : null;
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

export function getWritableColumnProperties(
  column: NormalizedField | Field,
  isNative: boolean,
) {
  return _.pick(
    column,
    isNative
      ? WRITABLE_NATIVE_COLUMN_PROPERTIES
      : WRITABLE_MBQL_COLUMN_PROPERTIES,
  );
}
