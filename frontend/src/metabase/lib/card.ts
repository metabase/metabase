import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { stableStringify } from "metabase/lib/objects";
import { equals } from "metabase/lib/utils";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card, ParameterValuesMap, UnsavedCard } from "metabase-types/api";

import { canRunQuery } from "./query";

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
    return equals(getCleanCard(card1), getCleanCard(card2));
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
 * Hydrates the cards dataset_query in to a Lib.Query.
 */
export function getCardQuery(metadata: Metadata, card: Card) {
  const provider = Lib.metadataProvider(card.dataset_query.database, metadata);
  return Lib.fromJsQuery(provider, card.dataset_query);
}

/**
 * Returns true if the card is valid and runnable.
 */
export function canRunCard(metadata: Metadata, card: Card) {
  const query = getCardQuery(metadata, card);
  return canRunQuery(query, card.type);
}
