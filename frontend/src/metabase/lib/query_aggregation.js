import _ from "underscore";

import { isMath } from "metabase/lib/expressions";

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

// predicate function to test if a given aggregation clause is fully formed
export function isValid(aggregation) {
  if (
    aggregation &&
    _.isArray(aggregation) &&
    ((aggregation.length === 1 && aggregation[0] !== null) ||
      (aggregation.length === 2 &&
        aggregation[0] !== null &&
        aggregation[1] !== null))
  ) {
    return true;
  }
  return false;
}

// predicate function to test if the given aggregation clause represents a Bare Rows aggregation
export function isBareRows(aggregation) {
  return isValid(aggregation) && aggregation[0] === "rows";
}

// predicate function to test if a given aggregation clause represents a standard aggregation
export function isStandard(aggregation) {
  return isValid(aggregation) && aggregation[0] !== "metric";
}

export function getAggregation(aggregation) {
  return aggregation && aggregation[0];
}

// predicate function to test if a given aggregation clause represents a metric
export function isMetric(aggregation) {
  return isValid(aggregation) && aggregation[0] === "metric";
}

// get the metricId from a metric aggregation clause
export function getMetric(aggregation) {
  if (aggregation && isMetric(aggregation)) {
    return aggregation[1];
  } else {
    return null;
  }
}

export function isCustom(aggregation) {
  // for now treal all named clauses as custom
  return (
    (aggregation && hasOptions(aggregation)) ||
    isMath(aggregation) ||
    (isStandard(aggregation) && _.any(aggregation.slice(1), arg => isMath(arg)))
  );
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
