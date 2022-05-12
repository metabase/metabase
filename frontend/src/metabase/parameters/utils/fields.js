export function hasFieldValues(parameter) {
  if (!Array.isArray(parameter.fields)) {
    return false;
  }

  return parameter.fields.some(field => field.hasFieldValues());
}

export function getFieldIds(parameter) {
  const { field_ids = [], field_id } = parameter;
  const fieldIds = field_id ? [field_id] : field_ids;
  return fieldIds.filter(id => typeof id === "number");
}
