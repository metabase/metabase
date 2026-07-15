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

// Already [[value], [value, label], ...] tuples vs deprecated flat scalars; an array-valued
// first row is ambiguous either way (metabase#3417).
function isFieldValueTuples(
  values: RowValue[] | FieldValue[],
): values is FieldValue[] {
  return values.length === 0 || Array.isArray(values[0]);
}

// Metadata field "values" type is inconsistent
// https://github.com/metabase/metabase/issues/3417
export function getFieldValues(field?: RawField | null): FieldValue[] {
  const values = field && field.values;
  if (Array.isArray(values)) {
    if (isFieldValueTuples(values)) {
      return values;
    } else {
      return values.map((value): FieldValue => [value]);
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

// Build a value -> label map.
export function fieldValuesToMap(
  values: FieldValue[],
): Map<RowValue, string | undefined> {
  // new Map() pads [value] 1-tuples with undefined at runtime, but its constructor
  // overload requires 2-tuples, hence the cast.
  return new Map(values as [RowValue, string | undefined][]);
}
