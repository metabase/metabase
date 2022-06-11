import slugg from "slugg";

import { serializeCardForUrl } from "metabase/lib/card";
import MetabaseSettings from "metabase/lib/settings";

import Question, { QuestionCreatorOpts } from "metabase-lib/lib/Question";
import { Card as BaseCard } from "metabase-types/types/Card";

import { appendSlug, extractQueryParams } from "./utils";

type Card = Partial<BaseCard> & {
  id?: number | string;
  card_id?: string;
  name?: string;
  model?: "card" | "dataset";
  dataset?: boolean;
};

export const newQuestionFlow = () => "/question/new";

type QuestionUrlBuilderParams = {
  hash?: Card | string;
  query?: Record<string, unknown> | string;
  objectId?: number | string;
};

export function question(
  card: Card | null,
  { hash = "", query = "", objectId }: QuestionUrlBuilderParams = {},
) {
  if (hash && typeof hash === "object") {
    hash = serializeCardForUrl(hash);
  }

  if (query && typeof query === "object") {
    query = extractQueryParams(query)
      .filter(([key, value]) => value !== undefined)
      .map(kv => kv.map(encodeURIComponent).join("="))
      .join("&");
  }

  if (hash && hash.charAt(0) !== "#") {
    hash = "#" + hash;
  }

  if (query && query.charAt(0) !== "?") {
    query = "?" + query;
  }

  if (!card || !card.id) {
    return `/question${query}${hash}`;
  }

  const { card_id, id, name } = card;
  let path = card?.dataset || card?.model === "dataset" ? "model" : "question";

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

  if (objectId) {
    path = `${path}/${objectId}`;
  }

  return `${path}${query}${hash}`;
}

export function serializedQuestion(card: Card, opts = {}) {
  return question(null, { ...opts, hash: card });
}

type NewQuestionUrlBuilderParams = QuestionCreatorOpts & {
  mode?: "view" | "notebook";
  creationType?: string;
  objectId?: number | string;
};

export function newQuestion({
  mode,
  creationType,
  objectId,
  ...options
}: NewQuestionUrlBuilderParams = {}) {
  const url = Question.create(options).getUrl({
    creationType,
    query: objectId ? { objectId } : undefined,
  });
  if (mode) {
    return url.replace(/^\/question/, `/question\/${mode}`);
  } else {
    return url;
  }
}

export function dataset(...args: Parameters<typeof question>) {
  return question(...args);
}

export function publicQuestion(
  uuid: string,
  type: string | null = null,
  query?: string,
) {
  const siteUrl = MetabaseSettings.get("site-url");
  const searchQuery = query ? `?${query}` : "";
  return (
    `${siteUrl}/public/question/${uuid}` +
    (type ? `.${type}` : "") +
    searchQuery
  );
}

export function embedCard(token: string, type: string | null = null) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/question/${token}` + (type ? `.${type}` : ``);
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
