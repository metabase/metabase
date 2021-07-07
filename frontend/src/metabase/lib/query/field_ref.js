import _ from "underscore";

import Field from "metabase-lib/lib/metadata/Field";
import { FieldDimension } from "metabase-lib/lib/Dimension";
import * as Table from "./table";

import { TYPE } from "metabase/lib/types";
import type { FieldId, FieldReference } from "metabase-types/types/Query";

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

/**
 * Get the target field ID (recursively) from a Field clause. For Field clauses that use string Field names, this
 * returns the Field clause directly. FIXME !!!
 */
export function getFieldTargetId(field: FieldReference): ?FieldId {
  if (isLocalField(field)) {
    return typeof field[1] === "number" ? field[1] : field;
  }
  console.warn("Unknown field type:", field);
}

/*
 * Gets the table and field definitions from a Field clause.
 */
export function getFieldTarget(fieldClause, tableDef, path = []) {
  if (isExpressionField(fieldClause)) {
    // hmmm, since this is a dynamic field we'll need to build this here
    // but base it on Field object, since some functions are used, when adding as filter
    const fieldDef = new Field({
      display_name: fieldClause[1],
      name: fieldClause[1],
      expression_name: fieldClause[1],
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

  const dimension = FieldDimension.parseMBQLOrWarn(fieldClause);
  if (!dimension) {
    return null;
  }

  const info = {
    table: tableDef,
    field: Table.getField(tableDef, dimension.field().id),
    path,
  };

  // TODO -- not really sure what is happening here, but it makes the tests pass.
  const fk = dimension.fk();
  if (fk) {
    const fkFieldId = fk.field().id;
    const fkFieldDef = Table.getField(tableDef, fkFieldId);
    const targetTableDef = fkFieldDef && fkFieldDef.target.table;
    return getFieldTarget(
      dimension.withoutOptions("source-field").mbql(),
      targetTableDef,
      path.concat(fkFieldDef),
    );
  }

  if (dimension.temporalUnit()) {
    info.unit = dimension.temporalUnit();
  }

  return info;
}

export function getDatetimeUnit(fieldClause) {
  if (isLocalField(fieldClause)) {
    const dimension = FieldDimension.parseMBQLOrWarn(fieldClause);
    return dimension && dimension.temporalUnit();
  }
}
