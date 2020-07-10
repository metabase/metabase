/* @flow */

import { noNullValues, add, update, remove, clear } from "./util";
import * as FieldRef from "./field_ref";
import { STANDARD_AGGREGATIONS } from "metabase/lib/expressions";

import _ from "underscore";

import type {
  AggregationClause,
  Aggregation,
  AggregationWithOptions,
  AggregationOptions,
  ConcreteField,
} from "metabase-types/types/Query";
import type { MetricId } from "metabase-types/types/Metric";

export const SORTABLE_AGGREGATION_TYPES = new Set([
  "avg",
  "count",
  "distinct",
  "stddev",
  "sum",
  "min",
  "max",
]);

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

// NOTE: these only differentiate between "standard", "metric", and "custom", but do not validate the aggregation

export function isStandard(aggregation: any): boolean {
  return (
    Array.isArray(aggregation) &&
    STANDARD_AGGREGATIONS.has(aggregation[0]) &&
    // this is needed to differentiate between "standard" aggregations with simple fields (or no field) and custom expressions,
    // the latter would cause the aggregation to be considered "custom"
    (aggregation[1] == null || FieldRef.isValidField(aggregation[1]))
  );
}

export function isMetric(aggregation: any): boolean {
  return Array.isArray(aggregation) && aggregation[0] === "metric";
}

export function isCustom(aggregation: any): boolean {
  return !isStandard(aggregation) && !isMetric(aggregation);
}

// AGGREGATION OPTIONS / NAMED AGGREGATIONS

export function hasOptions(aggregation: any): boolean {
  return Array.isArray(aggregation) && aggregation[0] === "aggregation-options";
}
export function getOptions(aggregation: any): AggregationOptions {
  return hasOptions(aggregation) ? aggregation[2] : {};
}
export function getContent(aggregation: any): Aggregation {
  return hasOptions(aggregation) ? aggregation[1] : aggregation;
}
export function isNamed(aggregation: any): boolean {
  return !!getName(aggregation);
}
export function getName(aggregation: any): ?string {
  return getOptions(aggregation)["display-name"];
}
export function setName(
  aggregation: any,
  name: string,
): AggregationWithOptions {
  return [
    "aggregation-options",
    getContent(aggregation),
    { "display-name": name, ...getOptions(aggregation) },
  ];
}
export function setContent(
  aggregation: any,
  content: Aggregation,
): AggregationWithOptions {
  return ["aggregation-options", content, getOptions(aggregation)];
}

// METRIC
export function getMetric(aggregation: any): ?MetricId {
  if (isMetric(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

// STANDARD

// get the operator from a standard aggregation clause
export function getOperator(aggregation: any) {
  if (isStandard(aggregation)) {
    return aggregation[0];
  } else {
    return null;
  }
}

// get the fieldId from a standard aggregation clause
export function getField(aggregation: any): ?ConcreteField {
  if (isStandard(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

// set the fieldId on a standard aggregation clause
export function setField(aggregation: any, fieldRef: ConcreteField) {
  if (isStandard(aggregation)) {
    return [aggregation[0], fieldRef];
  } else {
    // TODO: is there a better failure response than just returning the aggregation unmodified??
    return aggregation;
  }
}

// MISC

export function isSortable(aggregation: any) {
  return SORTABLE_AGGREGATION_TYPES.has(getContent(aggregation)[0]);
}
