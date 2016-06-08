/* @flow */

import type { StructuredQueryObject, NativeQueryObject } from "./types/Query";
import type { CardObject, StructuredDatasetQueryObject, NativeDatasetQueryObject } from "./types/Card";

import * as Query from "./Query";

export const STRUCTURED_QUERY_TEMPLATE: StructuredDatasetQueryObject = {
    database: null,
    type: "query",
    query: {
        source_table: null,
        aggregation: ["rows"],
        breakout: [],
        filter: []
    }
};

export const NATIVE_QUERY_TEMPLATE: NativeDatasetQueryObject = {
    database: null,
    type: "native",
    native: {
        query: ""
    }
};

export function isStructured(card: CardObject): bool {
    return card.dataset_query.type === "query";
}

export function isNative(card: CardObject): bool {
    return card.dataset_query.type === "native";
}

export function canRun(card: CardObject): bool {
    if (card.dataset_query.type === "query") {
        const query : StructuredQueryObject = card.dataset_query.query;
        return query && query.source_table != undefined && Query.hasValidAggregation(query);
    } else if (card.dataset_query.type === "native") {
        const native : NativeQueryObject = card.dataset_query.native;
        return native && card.dataset_query.database != undefined && native.query !== "";
    } else {
        return false;
    }
}

export function getQuery(card: CardObject): ?StructuredQueryObject {
    if (card.dataset_query.type === "query") {
        return card.dataset_query.query;
    } else {
        return null;
    }
}
