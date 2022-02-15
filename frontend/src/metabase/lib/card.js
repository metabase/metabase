import _ from "underscore";
import * as Q_DEPRECATED from "metabase/lib/query";
import Utils from "metabase/lib/utils";

import { CardApi } from "metabase/services";
import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";

export function createCard(name = null) {
  return {
    name: name,
    display: "table",
    visualization_settings: {},
    dataset_query: {},
  };
}

// start a new card using the given query type and optional database and table selections
export function startNewCard(type, databaseId, tableId) {
  // create a brand new card to work from
  const card = createCard();
  card.dataset_query = Q_DEPRECATED.createQuery(type, databaseId, tableId);

  return card;
}

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
// TODO: move to redux
export async function loadCard(cardId) {
  try {
    return await CardApi.get({ cardId: cardId });
  } catch (error) {
    console.log("error loading card", error);
    throw error;
  }
}

// TODO Atte Keinänen 5/31/17 Deprecated, we should move tests to Questions.spec.js
export function serializeCardForUrl(card) {
  const dataset_query = Utils.copy(card.dataset_query);
  if (dataset_query.query) {
    dataset_query.query = Q_DEPRECATED.cleanQuery(dataset_query.query);
  }

  const cardCopy = {
    name: card.name,
    description: card.description,
    dataset_query: dataset_query,
    display: card.display,
    displayIsLocked: card.displayIsLocked,
    parameters: card.parameters,
    dashboardId: card.dashboardId,
    dashcardId: card.dashcardId,
    visualization_settings: card.visualization_settings,
    original_card_id: card.original_card_id,
  };

  return utf8_to_b64url(JSON.stringify(cardCopy));
}

export function deserializeCardFromUrl(serialized) {
  return JSON.parse(b64hash_to_utf8(serialized));
}

export function cleanCopyCard(card) {
  const cardCopy = {};
  for (const name in card) {
    if (name.charAt(0) !== "$") {
      cardCopy[name] = card[name];
    }
  }
  return cardCopy;
}
