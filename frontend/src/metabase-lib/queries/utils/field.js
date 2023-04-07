import _ from "underscore";

import { add, update, remove, clear } from "./util";

// returns canonical list of Fields, with nulls removed
function getFields(fields) {
  return (fields || []).filter(b => b != null);
}

// turns a list of Fields into the canonical FieldClause
function getFieldClause(fields) {
  fields = getFields(fields);
  if (fields.length === 0) {
    return undefined;
  } else {
    return fields;
  }
}

export function addField(fields, newField) {
  return getFieldClause(add(getFields(fields), newField));
}
export function updateField(fields, index, updatedField) {
  return getFieldClause(update(getFields(fields), index, updatedField));
}
export function removeField(fields, index) {
  return getFieldClause(remove(getFields(fields), index));
}
export function clearFields(fields) {
  return getFieldClause(clear());
}

// Metadata field "values" type is inconsistent
// https://github.com/metabase/metabase/issues/3417
export function getFieldValues(field) {
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
export function getRemappings(field) {
  const remappings = (field && field.remappings) || [];
  const fieldValues = getFieldValues(field);
  return [...fieldValues, ...remappings];
}
