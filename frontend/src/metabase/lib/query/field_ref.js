import _ from "underscore";

import Field from "metabase-lib/lib/metadata/Field";
import * as Table from "./table";

import { TYPE } from "metabase/lib/types";

export function isLocalField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "field";
}

export function isExpressionField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "expression";
}

export function isAggregateField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "aggregation";
}

export function isValidField(field) {
  return (
    (isLocalField(field) && field.length === 3) ||
    (isExpressionField(field) && _.isString(field[1])) ||
    (isAggregateField(field) && typeof field[1] === "number")
  );
}

export function isSameField(fieldA, fieldB, exact = false) {
  if (exact) {
    return _.isEqual(fieldA, fieldB);
  } else {
    return getFieldTargetId(fieldA) === getFieldTargetId(fieldB);
  }
}

// gets the target field ID (recursively) from any type of field, including raw field ID, fk->, and datetime-field cast.
export function getFieldTargetId(field: FieldReference): ?FieldId {
  if (isLocalField(field)) {
    // $FlowFixMe
    return field[1];
  }
  console.warn("Unknown field type: ", field);
}

// gets the table and field definitions from from a raw, fk->, or datetime-field field
export function getFieldTarget(field, tableDef, path = []) {
  if (isLocalField(field)) {
    return getFieldTarget(field[1], tableDef, path);
  } else if (isExpressionField(field)) {
    // hmmm, since this is a dynamic field we'll need to build this here
    // but base it on Field object, since some functions are used, when adding as filter
    const fieldDef = new Field({
      display_name: field[1],
      name: field[1],
      expression_name: field[1],
      table: tableDef,
      metadata: tableDef.metadata,
      // TODO: we need to do something better here because filtering depends on knowing a sensible type for the field
      base_type: TYPE.Float,
    });

    return {
      table: tableDef,
      field: fieldDef,
      path: path,
    };
  }

  console.warn("Unknown field type: ", field);
}

export function getDatetimeUnit(field) {
  if (isLocalField(field)) {
    const options = field[2];
    return options && options["temporal-unit"];
  }
}
