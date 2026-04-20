import querystring from "querystring";

import _ from "underscore";

import {
  b64hash_to_utf8,
  b64url_to_utf8,
  utf8_to_b64url,
} from "metabase/utils/encoding";
import { stableStringify } from "metabase/utils/objects";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type { Card, ParameterValuesMap, UnsavedCard } from "metabase-types/api";

export type SerializeCardOptions = {
  includeDatasetQuery?: boolean;
  includeOriginalCardId?: boolean;
  includeDisplayIsLocked?: boolean;
  creationType?: string;
  parameterValues?: ParameterValuesMap;
};

function getCleanCard(
  card: Card | UnsavedCard,
  {
    includeDatasetQuery = true,
    includeOriginalCardId = true,
    includeDisplayIsLocked = false,
    creationType,
    parameterValues,
  }: SerializeCardOptions = {},
) {
  const value = { ...card, creationType, parameterValues };
  const keysToInclude = [
    "collection_id",
    "dashboard_id",
    "dashboardId",
    "dashcardId",
    "description",
    "display",
    "name",
    "parameters",
    "type",
    "visualization_settings",
  ];

  if (includeDatasetQuery) {
    keysToInclude.push("dataset_query");
  }
  if (includeOriginalCardId) {
    keysToInclude.push("original_card_id");
  }
  if (includeDisplayIsLocked) {
    keysToInclude.push("displayIsLocked");
  }
  if (creationType) {
    keysToInclude.push("creationType");
  }
  if (parameterValues) {
    keysToInclude.push("parameterValues");
  }

  type Key = keyof typeof value;

  const res: { [key in Key]?: unknown } = {};
  for (const key of keysToInclude) {
    // coerce to undefined to omit
    res[key as Key] = value[key as Key] ?? undefined;
  }

  return res;
}

export function isEqualCard(card1?: Card | null, card2?: Card | null) {
  if (card1 && card2) {
    return _.isEqual(getCleanCard(card1), getCleanCard(card2));
  } else {
    return false;
  }
}

// TODO Atte Keinänen 5/31/17 Deprecated, we should move tests to Questions.spec.js
export function serializeCardForUrl(
  card: Card | UnsavedCard,
  options: SerializeCardOptions = {},
) {
  return utf8_to_b64url(stableStringify(getCleanCard(card, options)));
}

export function deserializeCardFromUrl(serialized: string): Card {
  return JSON.parse(b64hash_to_utf8(serialized));
}

/**
 * Converts a Metabot `navigate_to` path like `/question#<base64>` into a
 * Card suitable for `deserializedCard`.
 */
export function deserializeCardFromQuery(query: string): Card {
  const base64 = query.replace(/^\/question#/, "");
  return JSON.parse(b64url_to_utf8(base64));
}

export function deserializeCard(serializedCard: string) {
  const card = deserializeCardFromUrl(serializedCard);
  if (card.dataset_query.database != null) {
    card.dataset_query = normalize(card.dataset_query);
  }
  return card;
}

type HashOptions = {
  db?: string;
  table?: string;
  segment?: string;
};

export function parseHash(hash?: string) {
  let options: HashOptions = {};
  let serializedCard;

  // hash can contain either query params starting with ? or a base64 serialized card
  if (hash) {
    const cleanHash = hash.replace(/^#/, "");
    if (cleanHash.charAt(0) === "?") {
      options = querystring.parse(cleanHash.substring(1));
    } else {
      serializedCard = cleanHash;
    }
  }

  return { options, serializedCard };
}
