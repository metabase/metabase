import slugg from "slugg";

import {
  isTransientCardId,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import MetabaseSettings from "metabase/utils/settings";
import type { QuestionCreatorOpts } from "metabase-lib/v1/Question";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  CardId,
  ParameterValuesMap,
  Card as SavedCard,
  UnsavedCard,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import { appendSlug, getEncodedUrlSearchParams } from "./utils";

type Card = Partial<SavedCard> & {
  card_id?: CardId | string;
  model?: "card" | "dataset";
};

export type QuestionUrlBuilderParams = {
  mode?: "view" | "notebook" | "query";
  query?: Record<string, unknown> | string;
  objectId?: number | string;
  creationType?: string;
  parameterValues?: ParameterValuesMap;
  includeDisplayIsLocked?: boolean;
  // Route to the unsaved-with-hash URL even though the card has a real id —
  // used for dirty edits to a saved question that shouldn't land on the saved path.
  forceUnsaved?: boolean;
};

export function question(
  card: Partial<Card> | null,
  {
    mode = "view",
    query = "",
    objectId,
    creationType,
    parameterValues,
    includeDisplayIsLocked = false,
    forceUnsaved = false,
  }: QuestionUrlBuilderParams = {},
) {
  query = encodeIfNeeded(query, getEncodedUrlSearchParams);
  query = prefixIfNeeded(query, "?");

  const isModel = card?.type === "model" || card?.model === "dataset";
  const fallbackPath = isModel ? "model" : "question";
  let path: string = card?.type ?? fallbackPath;

  if (!card || !card.id || isTransientCardId(card.id) || forceUnsaved) {
    const unsavedPath = path === "metric" ? "question" : path;
    const hash = card?.dataset_query
      ? `#${serializeCardForUrl(card as SavedCard | UnsavedCard, {
          creationType,
          parameterValues,
          includeDisplayIsLocked,
        })}`
      : "";
    return `/${unsavedPath}${query}${hash}`;
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
  } else if (mode === "query") {
    if (card.type === "model" || card.type === "metric") {
      path = `${path}/query`;
    } else {
      path = `${path}/notebook`;
    }
  } else if (objectId) {
    path = `${path}/${objectId}`;
  }

  return `${path}${query}`;
}

function encodeIfNeeded<T extends object>(
  value: T | string,
  fn: (value: T) => string,
) {
  if (typeof value === "string") {
    return value;
  }
  return fn(value);
}

function prefixIfNeeded(value: string, prefix: string) {
  if (value === "" || value.startsWith(prefix)) {
    return value;
  }
  return `${prefix}${value}`;
}

export function serializedQuestion(card: SavedCard | UnsavedCard, opts = {}) {
  return question(card, { ...opts, forceUnsaved: true });
}

type NewQuestionUrlBuilderParams = QuestionCreatorOpts & {
  mode?: "view" | "notebook" | "query" | "ask";
  creationType?: string;
  objectId?: number | string;
};

export function newQuestion({
  mode,
  creationType,
  objectId,
  ...options
}: NewQuestionUrlBuilderParams) {
  if (mode === "ask") {
    return `/question/ask`;
  }

  const question = Question.create(options);
  const url = ML_Urls.getQuestionUrl(question, {
    creationType,
    query: objectId === undefined ? {} : { objectId },
  });
  const type = question.type();

  if (mode) {
    const pathType = type === "metric" ? "question" : type;
    return url.replace(/^\/(question|model|metric)/, `/${pathType}\/${mode}`);
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

export function embedCard(token: EntityToken, type: string | null = null) {
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

  // QB parses this querystring-in-hash to build an ad-hoc question — confusing, but load-bearing.
  return `/question#${query}`;
}

export function xrayModel(id: CardId) {
  return `/auto/dashboard/model/${id}`;
}
