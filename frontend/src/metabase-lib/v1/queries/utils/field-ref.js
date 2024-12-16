import _ from "underscore";

function isLocalField(field) {
  return Array.isArray(field) && field[0] === "field";
}

export function isExpressionField(field) {
  return Array.isArray(field) && field[0] === "expression";
}

export function isAggregateField(field) {
  return Array.isArray(field) && field[0] === "aggregation";
}

export function isValidField(field) {
  return (
    (isLocalField(field) && field.length === 3) ||
    (isExpressionField(field) && _.isString(field[1])) ||
    (isAggregateField(field) && typeof field[1] === "number")
  );
}
