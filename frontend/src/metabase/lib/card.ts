import _ from "underscore";

import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { equals } from "metabase/lib/utils";
import type { Card, UnsavedCard } from "metabase-types/api";

function getCleanCard(card: Card | UnsavedCard) {
  return _.pick(card, [
    "collection_id",
    "dashboardId",
    "dashcardId",
    "dataset_query",
    "description",
    "display",
    "displayIsLocked",
    "name",
    "original_card_id",
    "parameters",
    "type",
    "visualization_settings",
  ]);
}

export function isEqualCard(card1: Card, card2: Card) {
  if (card1 && card2) {
    return equals(getCleanCard(card1), getCleanCard(card2));
  } else {
    return false;
  }
}

// TODO Atte Keinänen 5/31/17 Deprecated, we should move tests to Questions.spec.js
export function serializeCardForUrl(card: Card | UnsavedCard): string {
  return utf8_to_b64url(JSON.stringify(getCleanCard(card)));
}

export function deserializeCardFromUrl(serialized: string): Card {
  return JSON.parse(b64hash_to_utf8(serialized));
}
