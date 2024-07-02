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
/**
 * Get the target field ID (recursively) from a Field clause. For Field clauses that use string Field names, this
 * returns the Field clause directly. FIXME !!!
 */
export function getFieldTargetId(field) {
  if (isLocalField(field)) {
    const type = typeof field[1];
    return type === "number" || type === "string" ? field[1] : field;
  }
  if (isExpressionField(field) && _.isString(field[1])) {
    return field[1];
  }
  console.warn("Unknown field type:", field);
}

export function hasSourceField(fieldClause) {
  return (
    isLocalField(fieldClause) &&
    fieldClause[2] &&
    fieldClause[2]["source-field"]
  );
}
