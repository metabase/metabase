import type { Field as FieldReference } from "metabase/meta/types/Query";
import type { Field, FieldId, FieldValues } from "metabase/meta/types/Field";
import type { Value } from "metabase/meta/types/Dataset";

// gets the target field ID (recursively) from any type of field, including raw field ID, fk->, and datetime-field cast.
export function getFieldTargetId(field: FieldReference): ?FieldId {
  if (isRegularField(field)) {
    // $FlowFixMe
    return field;
  } else if (isLocalField(field)) {
    // $FlowFixMe
    return field[1];
  } else if (isForeignKeyField(field)) {
    // $FlowFixMe
    return getFieldTargetId(field[2]);
  } else if (isDatetimeField(field)) {
    // $FlowFixMe
    return getFieldTargetId(field[1]);
  } else if (isBinningStrategy(field)) {
    // $FlowFixMe
    return getFieldTargetId(field[1]);
  } else if (isFieldLiteral(field)) {
    return field;
  }
  console.warn("Unknown field type: ", field);
}

export function isRegularField(field: FieldReference): boolean {
  return typeof field === "number";
}

export function isLocalField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "field-id";
}

export function isForeignKeyField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "fk->";
}

export function isDatetimeField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "datetime-field";
}

export function isBinningStrategy(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "binning-strategy";
}

export function isFieldLiteral(field: FieldReference): boolean {
  return (
    Array.isArray(field) && field.length === 3 && field[0] === "field-literal"
  );
}

export function isExpressionField(field: FieldReference): boolean {
  return (
    Array.isArray(field) && field.length === 2 && field[0] === "expression"
  );
}

export function isAggregateField(field: FieldReference): boolean {
  return Array.isArray(field) && field[0] === "aggregation";
}

import _ from "underscore";

// Metadata field "values" type is inconsistent
// https://github.com/metabase/metabase/issues/3417
export function getFieldValues(field: ?Field): FieldValues {
  const values = field && field.values;
  if (Array.isArray(values)) {
    if (values.length === 0 || Array.isArray(values[0])) {
      return values;
    } else {
      // console.warn("deprecated field values array!", values);
      return values.map(value => [value]);
    }
  } else if (values && Array.isArray(values.values)) {
    // console.warn("deprecated field values object!", values);

    if (Array.isArray(values.human_readable_values)) {
      return _.zip(values.values, values.human_readable_values || {});
    } else if (Array.isArray(values.values)) {
      // TODO Atte Keinänen 7/12/17: I don't honestly know why we can have a field in `values` property.
      return getFieldValues(values);
    } else {
      // console.warn("missing field values", field);
      return [];
    }
  } else {
    // console.warn("missing field values", field);
    return [];
  }
}

// merge field values and remappings
export function getRemappings(field: ?Field) {
  const remappings = (field && field.remappings) || [];
  const fieldValues = getFieldValues(field);
  return [...fieldValues, ...remappings];
}

export function getHumanReadableValue(
  value: Value,
  fieldValues?: FieldValues = [],
) {
  const fieldValue = _.findWhere(fieldValues, { [0]: value });
  return fieldValue && fieldValue.length === 2 ? fieldValue[1] : String(value);
}
