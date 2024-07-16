import Questions from "metabase/entities/questions";
import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { equals } from "metabase/lib/utils";

export function createCard(name = null) {
  return {
    name: name,
    display: "table",
    visualization_settings: {},
    dataset_query: {},
  };
}

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
// TODO: move to redux
export async function loadCard(cardId, { dispatch, getState }) {
  try {
    await dispatch(
      Questions.actions.fetch(
        { id: cardId },
        {
          properties: [
            "id",
            "dataset_query",
            "display",
            "visualization_settings",
          ], // complies with Card interface
        },
      ),
    );

    const question = Questions.selectors.getObject(getState(), {
      entityId: cardId,
    });

    return question?.card();
  } catch (error) {
    console.error("error loading card", error);
    throw error;
  }
}

function getCleanCard(card) {
  return {
    name: card.name,
    collectionId: card.collectionId,
    description: card.description,
    dataset_query: card.dataset_query,
    display: card.display,
    displayIsLocked: card.displayIsLocked,
    parameters: card.parameters,
    dashboardId: card.dashboardId,
    dashcardId: card.dashcardId,
    visualization_settings: card.visualization_settings,
    original_card_id: card.original_card_id,
    type: card.type,
  };
}

export function isEqualCard(card1, card2) {
  if (card1 && card2) {
    return equals(getCleanCard(card1), getCleanCard(card2));
  } else {
    return false;
  }
}

// TODO Atte Keinänen 5/31/17 Deprecated, we should move tests to Questions.spec.js
export function serializeCardForUrl(card) {
  return utf8_to_b64url(JSON.stringify(getCleanCard(card)));
}

export function deserializeCardFromUrl(serialized) {
  return JSON.parse(b64hash_to_utf8(serialized));
}
