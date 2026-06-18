import _ from "underscore";

import type { FieldValue, RowValue } from "metabase-types/api";

type RawFieldValuesObject = {
  values?: RowValue[];
  human_readable_values?: string[];
};

type RawFieldValues = RowValue[] | FieldValue[] | RawFieldValuesObject;

type RawField = {
  values?: RawFieldValues;
  remappings?: FieldValue[];
};

// Metadata field "values" type is inconsistent
// https://github.com/metabase/metabase/issues/3417
export function getFieldValues(field?: RawField | null): FieldValue[] {
  const values = field && field.values;
  if (Array.isArray(values)) {
    if (values.length === 0 || Array.isArray(values[0])) {
      // already [[value], ...] tuples (or empty); the [0] check can't narrow RowValue[] to FieldValue[]
      return values as FieldValue[];
    } else {
      // deprecated flat scalars; cast collapses the RowValue[] | FieldValue[] union so .map is callable
      return (values as RowValue[]).map((value): FieldValue => [value]);
    }
  } else if (values && Array.isArray(values.values)) {
    if (Array.isArray(values.human_readable_values)) {
      return _.zip(values.values, values.human_readable_values || {});
    } else if (Array.isArray(values.values)) {
      // TODO Atte Keinänen 7/12/17: I don't honestly know why we can have a field in `values` property.
      return getFieldValues(values);
    } else {
      return [];
    }
  } else {
    return [];
  }
}

// merge field values and remappings
export function getRemappings(field?: RawField | null): FieldValue[] {
  const remappings = (field && field.remappings) || [];
  const fieldValues = getFieldValues(field);
  return [...fieldValues, ...remappings];
}
