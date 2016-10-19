import _ from "underscore";
import Query from "metabase/lib/query";
import { createQuery } from "metabase/lib/query";
import { AngularResourceProxy } from "metabase/lib/redux";

const Card = new AngularResourceProxy("Card", ["get"]);


export function createCard(name = null) {
    return {
        name: name,
        display: "table",
        visualization_settings: {},
        dataset_query: {}
    };
}

// start a new card using the given query type and optional database and table selections
export function startNewCard(type, databaseId, tableId) {
    // create a brand new card to work from
    let card = createCard();
    card.dataset_query = createQuery(type, databaseId, tableId);

    return card;
}

// load a card either by ID or from a base64 serialization.  if both are present then they are merged, which the serialized version taking precedence
export async function loadCard(cardId) {
    try {
        let card = card = await Card.get({ "cardId": cardId });

        // strip off angular $xyz stuff
        return card && cleanCopyCard(card);

    } catch (error) {
        console.log("error loading card", error);
        throw error;
    }
}

// predicate function that dermines if a given card is "dirty" compared to the last known version of the card
export function isCardDirty(card, originalCard) {
    // The rules:
    //   - if it's new, then it's dirty when
    //       1) there is a database/table chosen or
    //       2) when there is any content on the native query
    //   - if it's saved, then it's dirty when
    //       1) the current card doesn't match the last saved version

    if (!card) {
        return false;
    } else if (!card.id) {
        if (card.dataset_query.query && card.dataset_query.query.source_table) {
            return true;
        } else if (card.dataset_query.native && !_.isEmpty(card.dataset_query.native.query)) {
            return true;
        } else {
            return false;
        }
    } else {
        const origCardSerialized = originalCard ? serializeCardForUrl(originalCard) : null;
        const newCardSerialized = card ? serializeCardForUrl(card) : null;
        return (newCardSerialized !== origCardSerialized);
    }
}

export function serializeCardForUrl(card) {
    // console.log(JSON.stringify(card, null, '  '));
    var dataset_query = angular.copy(card.dataset_query);
    if (dataset_query.query) {
        dataset_query.query = Query.cleanQuery(dataset_query.query);
    }
    var cardCopy = {
        name: card.name,
        description: card.description,
        dataset_query: dataset_query,
        display: card.display,
        parameters: card.parameters,
        visualization_settings: card.visualization_settings
    };
    return utf8_to_b64url(JSON.stringify(cardCopy));
}

export function deserializeCardFromUrl(serialized) {
    serialized = serialized.replace(/^#/, "");
    return JSON.parse(b64url_to_utf8(serialized));
}

// escaping before base64 encoding is necessary for non-ASCII characters
// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
export function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}
export function b64_to_utf8(b64) {
    return decodeURIComponent(escape(window.atob(b64)));
}

// for "URL safe" base64, replace "+" with "-" and "/" with "_" as per RFC 4648
export function utf8_to_b64url(str) {
    return utf8_to_b64(str).replace(/\+/g, "-").replace(/\//g, "_");
}
export function b64url_to_utf8(b64url) {
    return b64_to_utf8(b64url.replace(/-/g, "+").replace(/_/g, "/"))
}

export function urlForCardState(state, dirty) {
    var url;
    if (state.cardId) {
        url = "/card/" + state.cardId;
    } else {
        url = "/q";
    }
    if (state.serializedCard && dirty) {
        url += "#" + state.serializedCard;
    }
    return url;
}

export function cleanCopyCard(card) {
    var cardCopy = {};
    for (var name in card) {
        if (name.charAt(0) !== "$") {
            cardCopy[name] = card[name];
        }
    }
    return cardCopy;
}
