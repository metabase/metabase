/* @flow */

import { noNullValues, add, update, remove, clear } from "./util";
import { isValidField } from "./field_ref";
import { STANDARD_AGGREGATIONS } from "metabase/lib/expressions";

import _ from "underscore";

import type { AggregationClause, Aggregation } from "metabase/meta/types/Query";

// returns canonical list of Aggregations, i.e. with deprecated "rows" removed
export function getAggregations(
  aggregation: ?AggregationClause,
): Aggregation[] {
  let aggregations: Aggregation[];
  if (Array.isArray(aggregation) && Array.isArray(aggregation[0])) {
    aggregations = (aggregation: any);
  } else if (Array.isArray(aggregation) && typeof aggregation[0] === "string") {
    // legacy
    aggregations = [(aggregation: any)];
  } else {
    aggregations = [];
  }
  return aggregations.filter(agg => agg && agg[0] && agg[0] !== "rows");
}

// turns a list of Aggregations into the canonical AggregationClause
function getAggregationClause(aggregations: Aggregation[]): ?AggregationClause {
  aggregations = getAggregations(aggregations);
  if (aggregations.length === 0) {
    return undefined;
  } else {
    return aggregations;
  }
}

export function addAggregation(
  aggregation: ?AggregationClause,
  newAggregation: Aggregation,
): ?AggregationClause {
  return getAggregationClause(
    add(getAggregations(aggregation), newAggregation),
  );
}
export function updateAggregation(
  aggregation: ?AggregationClause,
  index: number,
  updatedAggregation: Aggregation,
): ?AggregationClause {
  return getAggregationClause(
    update(getAggregations(aggregation), index, updatedAggregation),
  );
}
export function removeAggregation(
  aggregation: ?AggregationClause,
  index: number,
): ?AggregationClause {
  return getAggregationClause(remove(getAggregations(aggregation), index));
}
export function clearAggregations(ac: ?AggregationClause): ?AggregationClause {
  return getAggregationClause(clear());
}

// MISC

export function isBareRows(ac: ?AggregationClause) {
  return getAggregations(ac).length === 0;
}

export function hasEmptyAggregation(ac: ?AggregationClause): boolean {
  return _.any(getAggregations(ac), aggregation => !noNullValues(aggregation));
}

export function hasValidAggregation(ac: ?AggregationClause): boolean {
  return _.all(getAggregations(ac), aggregation => noNullValues(aggregation));
}

// AGGREGATION TYPES

export function isStandard(aggregation: AggregationClause): boolean {
  return (
    Array.isArray(aggregation) &&
    STANDARD_AGGREGATIONS.has(aggregation[0]) &&
    (aggregation[1] === undefined || isValidField(aggregation[1]))
  );
}

export function isMetric(aggregation: AggregationClause): boolean {
  return Array.isArray(aggregation) && aggregation[0] === "metric";
}

export function isCustom(aggregation: AggregationClause): boolean {
  return !isStandard(aggregation) && !isMetric(aggregation);
}
