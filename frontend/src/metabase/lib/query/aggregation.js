/* @flow */

import { mbqlEq, noNullValues } from "./util";
import _ from "underscore";

import type { AggregationClause, Aggregation } from "metabase/meta/types/Query";

// returns canonical list list of aggregations, with deprecated "rows" removed
export function getAggregations(ac: ?AggregationClause): Aggregation[] {
    let aggregations: Aggregation[];
    if (Array.isArray(ac) && Array.isArray(ac[0])) {
        aggregations = (ac: any);
    } else if (Array.isArray(ac) && typeof ac[0] === "string") {
        // legacy
        aggregations = [(ac: any)];
    } else {
        aggregations = [];
    }
    return aggregations.filter(agg => agg && agg[0] && !mbqlEq(agg[0], "rows"));
}

export function isBareRows(ac: ?AggregationClause) {
    return getAggregations(ac).length === 0;
}

export function hasEmptyAggregation(ac: ?AggregationClause): boolean {
    return _.any(getAggregations(ac), (aggregation) => !noNullValues(aggregation));
}

export function hasValidAggregation(ac: ?AggregationClause): boolean {
    return _.all(getAggregations(ac), (aggregation) => noNullValues(aggregation));
}

export function addAggregation(ac: ?AggregationClause, aggregation: Aggregation): ?AggregationClause {
    const aggregations = getAggregations(ac);
    aggregations.push(aggregation);
    return canonicalize(aggregations);
}

export function updateAggregation(ac: ?AggregationClause, index: number, aggregation: Aggregation): ?AggregationClause {
    const aggregations = getAggregations(ac);
    aggregations.splice(index, 1, aggregation);
    return canonicalize(aggregations);
}

export function removeAggregation(ac: ?AggregationClause, index: number): ?AggregationClause {
    const aggregations = getAggregations(ac);
    aggregations.splice(index, 1);
    return canonicalize(aggregations);
}

export function clearAggregations(ac: ?AggregationClause): ?AggregationClause {
    return canonicalize([]);
}

function canonicalize(ac: ?AggregationClause): ?AggregationClause {
    let aggregations = getAggregations(ac);
    if (aggregations.length === 0) {
        return undefined;
    } else {
        return aggregations;
    }
}
