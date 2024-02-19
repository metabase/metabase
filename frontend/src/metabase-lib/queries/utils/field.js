import _ from "underscore";

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
