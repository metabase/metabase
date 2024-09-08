import slugg from "slugg";

import { serializeCardForUrl } from "metabase/lib/card";
import MetabaseSettings from "metabase/lib/settings";
import type { QuestionCreatorOpts } from "metabase-lib/v1/Question";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { CardId, Card as SavedCard } from "metabase-types/api";

import { appendSlug, getEncodedUrlSearchParams } from "./utils";

type Card = Partial<SavedCard> & {
  card_id?: CardId | string;
  model?: "card" | "dataset";
};

export type QuestionUrlBuilderParams = {
  mode?: "view" | "notebook";
  hash?: Card | string;
  query?: Record<string, unknown> | string;
  objectId?: number | string;
};

export function question(
  card: Partial<
    Pick<
      Card,
      | "id"
      | "name"
      | "type"
      | "card_id"
      | "model"
      | "collection_id"
      | "dashboard_id"
    >
  > | null,
  {
    mode = "view",
    hash = "",
    query = "",
    objectId,
  }: QuestionUrlBuilderParams = {},
) {
  if (hash && typeof hash === "object") {
    hash = serializeCardForUrl(hash);
  }

  if (query && typeof query === "object") {
    query = String(getEncodedUrlSearchParams(query));
  }

  if (hash && hash.charAt(0) !== "#") {
    hash = "#" + hash;
  }

  if (query && query.charAt(0) !== "?") {
    query = "?" + query;
  }

  const isModel = card?.type === "model" || card?.model === "dataset";
  const fallbackPath = isModel ? "model" : "question";
  let path: string = card?.type ?? fallbackPath;

  if (!card || !card.id) {
    return `/${path}${query}${hash}`;
  }

  const { card_id, id, name } = card;
  /**
   * If the question has been added to the dashboard we're reading the dashCard's properties.
   * In that case `card_id` is the actual question's id, while `id` corresponds with the dashCard itself.
   *
   * There can be multiple instances of the same question in a dashboard, hence this distinction.
   */
  const questionId = card_id || id;
  path = `/${path}/${questionId}`;

  /**
   * Although it's not possible to intentionally save a question without a name,
   * it is possible that the `name` is not recognized if it contains symbols.
   *
   * Please see: https://github.com/metabase/metabase/pull/15989#pullrequestreview-656646149
   */
  if (name) {
    path = appendSlug(path, slugg(name));
  }

  if (mode === "notebook") {
    path = `${path}/notebook`;
  } else if (objectId) {
    path = `${path}/${objectId}`;
  }

  return `${path}${query}${hash}`;
}

export function serializedQuestion(card: Card, opts = {}) {
  return question(null, { ...opts, hash: card });
}

type NewQuestionUrlBuilderParams = QuestionCreatorOpts & {
  mode?: "view" | "notebook" | "query";
  creationType?: string;
  objectId?: number | string;
};

export function newQuestion({
  mode,
  creationType,
  objectId,
  ...options
}: NewQuestionUrlBuilderParams) {
  const question = Question.create(options);
  const url = ML_Urls.getUrl(question, {
    creationType,
    query: objectId ? { objectId } : undefined,
  });
  const type = question.type();

  if (mode) {
    return url.replace(/^\/(question|model|metric)/, `/${type}\/${mode}`);
  }

  return url;
}

export function publicQuestion({
  uuid,
  type = null,
  query,
  includeSiteUrl = true,
}: {
  uuid: string;
  type?: string | null;
  query?: string;
  includeSiteUrl?: boolean;
}) {
  const siteUrl = includeSiteUrl ? MetabaseSettings.get("site-url") : "";
  const searchQuery = query ? `?${query}` : "";
  return (
    `${siteUrl}/public/question/${uuid}` +
    (type ? `.${type}` : "") +
    searchQuery
  );
}

export function embedCard(token: string, type: string | null = null) {
  return `/embed/question/${token}` + (type ? `.${type}` : ``);
}

export function tableRowsQuery(
  databaseId: number | string,
  tableId: number | string,
  metricId?: number | string,
  segmentId?: number | string,
) {
  let query = `?db=${databaseId}&table=${tableId}`;

  if (metricId) {
    query += `&metric=${metricId}`;
  }

  if (segmentId) {
    query += `&segment=${segmentId}`;
  }

  // This will result in a URL like "/question#?db=1&table=1"
  // The QB will parse the querystring and use DB and table IDs to create an ad-hoc question
  // We should refactor the initializeQB to avoid passing query string to hash as it's pretty confusing
  return question(null, { hash: query });
}

export function xrayModel(id: CardId) {
  return `/auto/dashboard/model/${id}`;
}
