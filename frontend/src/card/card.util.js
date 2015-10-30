import Query from "metabase/lib/query";

export function serializeCardForUrl(card) {
    var dataset_query = angular.copy(card.dataset_query);
    if (dataset_query.query) {
        dataset_query.query = Query.cleanQuery(dataset_query.query);
    }
    var cardCopy = {
        name: card.name,
        description: card.description,
        dataset_query: dataset_query,
        display: card.display,
        visualization_settings: card.visualization_settings
    };
    return utf8_to_b64(JSON.stringify(cardCopy));
}

export function deserializeCardFromUrl(serialized) {
    return JSON.parse(b64_to_utf8(serialized));
}

// escaping before base64 encoding is necessary for non-ASCII characters
// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}
function b64_to_utf8(str) {
    return decodeURIComponent(escape(window.atob(str)));
}

export function urlForCardState(state, dirty) {
    var url;
    if (state.cardId) {
        url = "/card/" + state.cardId;
    } else {
        url = "/q";
    }
    if (state.serializedCard && (!state.cardId || dirty)) {
        url += "/" + state.serializedCard;
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
