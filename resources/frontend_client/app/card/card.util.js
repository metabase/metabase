"use strict";

import Query from '../query_builder/query';

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
    return btoa(JSON.stringify(cardCopy));
}

export function deserializeCardFromUrl(serialized) {
    return JSON.parse(atob(serialized));
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
