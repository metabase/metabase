import _ from "underscore";
import { FieldDimension } from "metabase-lib/Dimension";

export function isLocalField(field) {
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

function isNotComparingLocalFieldRefs(refA, refB) {
  return !isLocalField(refA) || !isLocalField(refB);
}

export function isSameField(
  fieldA,
  fieldB,
  useDeepEquality = isNotComparingLocalFieldRefs(fieldA, fieldB),
) {
  if (useDeepEquality) {
    return _.isEqual(fieldA, fieldB);
  } else {
    return getFieldTargetId(fieldA) === getFieldTargetId(fieldB);
  }
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

export function isFieldLiteral(fieldClause) {
  return (
    isValidField(fieldClause) &&
    isLocalField(fieldClause) &&
    typeof fieldClause[1] === "string"
  );
}

export function getDatetimeUnit(fieldClause) {
  if (isLocalField(fieldClause)) {
    const dimension = FieldDimension.parseMBQLOrWarn(fieldClause);
    return dimension && dimension.temporalUnit();
  }
}

export function isDateTimeField(fieldClause) {
  return Boolean(getDatetimeUnit(fieldClause));
}

export function hasSourceField(fieldClause) {
  return (
    isLocalField(fieldClause) &&
    fieldClause[2] &&
    fieldClause[2]["source-field"]
  );
}
