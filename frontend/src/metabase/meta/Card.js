/* @flow */

import type { StructuredQuery, NativeQuery, TemplateTag } from "./types/Query";
import type { Card, DatasetQuery, StructuredDatasetQuery, NativeDatasetQuery } from "./types/Card";
import type { Parameter, ParameterId, ParameterMapping } from "metabase/meta/types/Dashboard";

declare class Object {
    static values<T>(object: { [key:string]: T }): Array<T>;
}

import Query from "metabase/lib/query";
import _ from "underscore";

export const STRUCTURED_QUERY_TEMPLATE: StructuredDatasetQuery = {
    type: "query",
    database: null,
    query: {
        source_table: null,
        aggregation: undefined,
        breakout: undefined,
        filter: undefined
    }
};

export const NATIVE_QUERY_TEMPLATE: NativeDatasetQuery = {
    type: "native",
    database: null,
    native: {
        query: "",
        template_tags: {}
    }
};

export function isStructured(card: Card): bool {
    return card.dataset_query.type === "query";
}

export function isNative(card: Card): bool {
    return card.dataset_query.type === "native";
}

export function canRun(card: Card): bool {
    if (card.dataset_query.type === "query") {
        const query : StructuredQuery = card.dataset_query.query;
        return query && query.source_table != undefined && Query.hasValidAggregation(query);
    } else if (card.dataset_query.type === "native") {
        const native : NativeQuery = card.dataset_query.native;
        return native && card.dataset_query.database != undefined && native.query !== "";
    } else {
        return false;
    }
}

export function getQuery(card: Card): ?StructuredQuery {
    if (card.dataset_query.type === "query") {
        return card.dataset_query.query;
    } else {
        return null;
    }
}

export function getTemplateTags(card: ?Card): Array<TemplateTag> {
    return card && card.dataset_query.type === "native" && card.dataset_query.native.template_tags ?
        Object.values(card.dataset_query.native.template_tags) :
        [];
}

export function applyParameters(
    card: Card,
    parameters: Array<Parameter>,
    parameterValues: { [key: ParameterId]: string } = {},
    parameterMappings: Array<ParameterMapping> = []
): DatasetQuery {
    const datasetQuery = JSON.parse(JSON.stringify(card.dataset_query));
    // clean the query
    if (datasetQuery.type === "query") {
        datasetQuery.query = Query.cleanQuery(datasetQuery.query);
    }
    datasetQuery.parameters = [];
    for (const parameter of parameters || []) {
        let value = parameterValues[parameter.id];

        // dashboards
        const mapping = _.findWhere(parameterMappings, { card_id: card.id, parameter_id: parameter.id });
        if (value != null && mapping) {
            datasetQuery.parameters.push({
                type: parameter.type,
                target: mapping.target,
                value: value
            });
        }

        // SQL parameters
        if (datasetQuery.type === "native") {
            let tag = _.findWhere(datasetQuery.native.template_tags, { id: parameter.id });
            if (tag) {
                datasetQuery.parameters.push({
                    type: parameter.type,
                    target: tag.type === "dimension" ?
                        ["dimension", ["template-tag", tag.name]]:
                        ["variable", ["template-tag", tag.name]],
                    value: value
                });
            }
        }
    }

    return datasetQuery;
}
