import { STANDARD_AGGREGATIONS } from "metabase-lib/expressions";
import * as FieldRef from "./field-ref";
import { add, update, remove, clear } from "./util";

// returns canonical list of Aggregations, i.e. with deprecated "rows" removed
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

// turns a list of Aggregations into the canonical AggregationClause
function getAggregationClause(aggregations) {
  aggregations = getAggregations(aggregations);
  if (aggregations.length === 0) {
    return undefined;
  } else {
    return aggregations;
  }
}

export function addAggregation(aggregation, newAggregation) {
  return getAggregationClause(
    add(getAggregations(aggregation), newAggregation),
  );
}
export function updateAggregation(aggregation, index, updatedAggregation) {
  return getAggregationClause(
    update(getAggregations(aggregation), index, updatedAggregation),
  );
}
export function removeAggregation(aggregation, index) {
  return getAggregationClause(remove(getAggregations(aggregation), index));
}
export function clearAggregations(ac) {
  return getAggregationClause(clear());
}

// MISC

export function isBareRows(ac) {
  return getAggregations(ac).length === 0;
}

// AGGREGATION TYPES

// NOTE: these only differentiate between "standard", "metric", and "custom", but do not validate the aggregation

export function isStandard(aggregation) {
  return (
    Array.isArray(aggregation) &&
    STANDARD_AGGREGATIONS.has(aggregation[0]) &&
    // this is needed to differentiate between "standard" aggregations with simple fields (or no field) and custom expressions,
    // the latter would cause the aggregation to be considered "custom"
    (aggregation[1] == null || FieldRef.isValidField(aggregation[1]))
  );
}

export function isMetric(aggregation) {
  return Array.isArray(aggregation) && aggregation[0] === "metric";
}

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
export function getContent(aggregation) {
  return hasOptions(aggregation) ? aggregation[1] : aggregation;
}
export function isNamed(aggregation) {
  return !!getName(aggregation);
}
export function getName(aggregation) {
  return getOptions(aggregation)["display-name"];
}
export function setName(aggregation, name) {
  return [
    "aggregation-options",
    getContent(aggregation),
    { name, "display-name": name, ...getOptions(aggregation) },
  ];
}
export function setContent(aggregation, content) {
  return ["aggregation-options", content, getOptions(aggregation)];
}

// METRIC
export function getMetric(aggregation) {
  if (isMetric(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

// STANDARD

// get the operator from a standard aggregation clause
export function getOperator(aggregation) {
  if (isStandard(aggregation)) {
    return aggregation[0];
  } else {
    return null;
  }
}

// set the fieldId on a standard aggregation clause
export function setField(aggregation, fieldRef) {
  if (isStandard(aggregation)) {
    return [aggregation[0], fieldRef];
  } else {
    // TODO: is there a better failure response than just returning the aggregation unmodified??
    return aggregation;
  }
}

export function isRows(aggregation) {
  return aggregation && aggregation[0] === "rows";
}
