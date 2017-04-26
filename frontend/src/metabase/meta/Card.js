/* @flow */

import type { StructuredQuery, NativeQuery, TemplateTag } from "./types/Query";
import type { Card, DatasetQuery, StructuredDatasetQuery, NativeDatasetQuery } from "./types/Card";
import type { Parameter, ParameterMapping, ParameterValues } from "./types/Parameter";

import { getTemplateTagParameters, getParameterTargetFieldId } from "metabase/meta/Parameter";

import { assoc } from "icepick";

declare class Object {
    static values<T>(object: { [key:string]: T }): Array<T>;
}

import Query from "metabase/lib/query";
import Utils from "metabase/lib/utils";
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
        const query = getQuery(card);
        return query != null && query.source_table != undefined && Query.hasValidAggregation(query);
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

export function getParameters(card: ?Card): Parameter[] {
    if (card && card.parameters) {
        return card.parameters;
    }

    const tags: TemplateTag[] = getTemplateTags(card);
    return getTemplateTagParameters(tags);
}

export function getParametersWithExtras(card: Card, parameterValues?: ParameterValues) {
    return getParameters(card).map(parameter => {
        // if we have a parameter value for this parameter, set "value"
        if (parameterValues && parameter.id in parameterValues) {
            parameter = assoc(parameter, "value", parameterValues[parameter.id]);
        }
        // if we have a field id for this parameter, set "field_id"
        const fieldId = getParameterTargetFieldId(parameter.target, card.dataset_query);
        if (fieldId != null) {
            parameter = assoc(parameter, "field_id", fieldId);
        }
        return parameter;
    })
}

export function applyParameters(
    card: Card,
    parameters: Parameter[],
    parameterValues: ParameterValues = {},
    parameterMappings: ParameterMapping[] = []
): DatasetQuery {
    const datasetQuery = Utils.copy(card.dataset_query);
    // clean the query
    if (datasetQuery.type === "query") {
        datasetQuery.query = Query.cleanQuery(datasetQuery.query);
    }
    datasetQuery.parameters = [];
    for (const parameter of parameters || []) {
        let value = parameterValues[parameter.id];
        if (value == null) {
            continue;
        }

        const mapping = _.findWhere(parameterMappings, { card_id: card.id, parameter_id: parameter.id });
        if (mapping) {
            // mapped target, e.x. on a dashboard
            datasetQuery.parameters.push({
                type: parameter.type,
                target: mapping.target,
                value: value
            });
        } else if (parameter.target) {
            // inline target, e.x. on a card
            datasetQuery.parameters.push({
                type: parameter.type,
                target: parameter.target,
                value: value
            });
        }
    }

    return datasetQuery;
}
