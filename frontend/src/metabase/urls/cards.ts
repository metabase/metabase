import slugg from "slugg";

import {
  isTransientCardId,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import type {
  CardId,
  ParameterValuesMap,
  Card as SavedCard,
  UnsavedCard,
} from "metabase-types/api";

import {
  appendSlug,
  encodeIfNeeded,
  getEncodedUrlSearchParams,
  prefixIfNeeded,
} from "./utils";

type Card = Partial<SavedCard> & {
  card_id?: CardId | string;
  model?: "card" | "dataset";
};

export type CardUrlBuilderParams = {
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

export function card(
  card: Partial<Card> | null,
  {
    mode = "view",
    query = "",
    objectId,
    creationType,
    parameterValues,
    includeDisplayIsLocked = false,
    forceUnsaved = false,
  }: CardUrlBuilderParams = {},
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
