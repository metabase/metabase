import { STANDARD_AGGREGATIONS } from "metabase-lib/v1/expressions";

import * as FieldRef from "./field-ref";
import { add, update, remove } from "./util";

/**
 * Returns canonical list of Aggregations, i.e. with deprecated "rows" removed
 * @deprecated use MLv2
 */
export function getAggregations(aggregation) {
  let aggregations;
  if (Array.isArray(aggregation) && Array.isArray(aggregation[0])) {
    aggregations = aggregation;
  } else if (Array.isArray(aggregation) && typeof aggregation[0] === "string") {
    // legacy
    aggregations = [aggregation];
  } else {
    aggregations = [];
  }
  return aggregations.filter(agg => agg && agg[0] && agg[0] !== "rows");
}

/**
 * Turns a list of Aggregations into the canonical AggregationClause
 */
function getAggregationClause(aggregations) {
  aggregations = getAggregations(aggregations);
  if (aggregations.length === 0) {
    return undefined;
  } else {
    return aggregations;
  }
}

/**
 * @deprecated use MLv2
 */
export function addAggregation(aggregation, newAggregation) {
  return getAggregationClause(
    add(getAggregations(aggregation), newAggregation),
  );
}

/**
 * @deprecated use MLv2
 */
export function updateAggregation(aggregation, index, updatedAggregation) {
  return getAggregationClause(
    update(getAggregations(aggregation), index, updatedAggregation),
  );
}

/**
 * @deprecated use MLv2
 */
export function removeAggregation(aggregation, index) {
  return getAggregationClause(remove(getAggregations(aggregation), index));
}

// MISC
/**
 * @deprecated use MLv2
 */
export function isBareRows(ac) {
  return getAggregations(ac).length === 0;
}

// AGGREGATION TYPES

// NOTE: these only differentiate between "standard", "metric", and "custom", but do not validate the aggregation
/**
 * @deprecated use MLv2
 */
export function isStandard(aggregation) {
  return (
    Array.isArray(aggregation) &&
    STANDARD_AGGREGATIONS.has(aggregation[0]) &&
    // this is needed to differentiate between "standard" aggregations with simple fields (or no field) and custom expressions,
    // the latter would cause the aggregation to be considered "custom"
    (aggregation[1] == null || FieldRef.isValidField(aggregation[1]))
  );
}

/**
 * @deprecated use MLv2
 */
export function isMetric(aggregation) {
  return Array.isArray(aggregation) && aggregation[0] === "metric";
}

/**
 * @deprecated use MLv2
 */
export function isCustom(aggregation) {
  return !isStandard(aggregation) && !isMetric(aggregation);
}

// AGGREGATION OPTIONS / NAMED AGGREGATIONS

function hasOptions(aggregation) {
  return Array.isArray(aggregation) && aggregation[0] === "aggregation-options";
}
function getOptions(aggregation) {
  return hasOptions(aggregation) && aggregation[2] ? aggregation[2] : {};
}

/**
 * @deprecated use MLv2
 */
export function getContent(aggregation) {
  return hasOptions(aggregation) ? aggregation[1] : aggregation;
}

/**
 * @deprecated use MLv2
 */
export function isNamed(aggregation) {
  return !!getName(aggregation);
}

/**
 * @deprecated use MLv2
 */
export function getName(aggregation) {
  return getOptions(aggregation)["display-name"];
}

/**
 * @deprecated use MLv2
 */
export function setName(aggregation, name) {
  return [
    "aggregation-options",
    getContent(aggregation),
    { name, "display-name": name, ...getOptions(aggregation) },
  ];
}

// METRIC
/**
 * @deprecated use MLv2
 */
export function getMetric(aggregation) {
  if (isMetric(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

// STANDARD

/**
 * Get the operator from a standard aggregation clause
 * @deprecated use MLv2
 */
export function getOperator(aggregation) {
  if (isStandard(aggregation)) {
    return aggregation[0];
  } else {
    return null;
  }
}

/**
 * Set the fieldId on a standard aggregation clause
 * @deprecated use MLv2
 */
export function setField(aggregation, fieldRef) {
  if (isStandard(aggregation)) {
    return [aggregation[0], fieldRef];
  } else {
    // TODO: is there a better failure response than just returning the aggregation unmodified??
    return aggregation;
  }
}

/**
 * @deprecated use MLv2
 */
export function isRows(aggregation) {
  return aggregation && aggregation[0] === "rows";
}
