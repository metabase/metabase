import { isValidField } from "./query/field_ref";

// these are aggregations that can't only be added via custom aggregations
export const SPECIAL_AGGREGATIONS = new Set([
  "share",
  "sum-where",
  "count-where",
  // TODO: add these to schema_metadata.js and remove from here
  "var",
  "median",
  "percentile",
]);

export function hasOptions(clause) {
  return Array.isArray(clause) && clause[0] === "aggregation-options";
}
export function getOptions(clause) {
  return hasOptions(clause) ? clause[2] : {};
}
export function getContent(clause) {
  return hasOptions(clause) ? clause[1] : clause;
}
export function isNamed(clause) {
  return getOptions(clause)["display-name"];
}
export function getName(clause) {
  return getOptions(clause)["display-name"];
}
export function setName(clause, name) {
  return [
    "aggregation-options",
    getContent(clause),
    { "display-name": name, ...getOptions(clause) },
  ];
}
export function setContent(clause, content) {
  return ["aggregation-options", content, getOptions(clause)];
}

function isValidClause(aggregation) {
  return (
    Array.isArray(aggregation) &&
    aggregation.length > 0 &&
    aggregation.every(a => a != null)
  );
}

// predicate functions
export function isStandard(aggregation) {
  return (
    isValidClause(aggregation) &&
    !isMetric(aggregation) &&
    !isSpecial(aggregation) &&
    (aggregation.length === 1 ||
      (aggregation.length === 2 && isValidField(aggregation[1])))
  );
}
export function isCustom(aggregation) {
  // for now treat all named clauses as custom
  return (
    isValidClause(aggregation) &&
    ((aggregation && hasOptions(aggregation)) ||
      (!isMetric(aggregation) && !isStandard(aggregation)))
  );
}

export function isMetric(aggregation) {
  return isValidClause(aggregation) && aggregation[0] === "metric";
}

export function isSpecial(aggregation) {
  return isValidClause(aggregation) && SPECIAL_AGGREGATIONS.has(aggregation[0]);
}

export function isValid(aggregation) {
  return (
    isStandard(aggregation) || isMetric(aggregation) || isCustom(aggregation)
  );
}

export function getAggregation(aggregation) {
  return aggregation && aggregation[0];
}

// get the metricId from a metric aggregation clause
export function getMetric(aggregation) {
  if (aggregation && isMetric(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

// get the operator from a standard aggregation clause
export function getOperator(aggregation) {
  if (aggregation && aggregation.length > 0 && aggregation[0] !== "metric") {
    return aggregation[0];
  } else {
    return null;
  }
}

// get the fieldId from a standard aggregation clause
export function getField(aggregation) {
  if (aggregation && aggregation.length > 1 && aggregation[0] !== "metric") {
    return aggregation[1];
  } else {
    return null;
  }
}

// set the fieldId on a standard aggregation clause
export function setField(aggregation, fieldId) {
  if (
    aggregation &&
    aggregation.length > 0 &&
    aggregation[0] &&
    aggregation[0] !== "metric"
  ) {
    return [aggregation[0], fieldId];
  } else {
    // TODO: is there a better failure response than just returning the aggregation unmodified??
    return aggregation;
  }
}
