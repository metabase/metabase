export function hasFieldValues(parameter) {
  return parameter.fields.some(field => field.hasFieldValues());
}

export function getFields(metadata, parameter) {
  if (!metadata) {
    return [];
  }
  return (
    parameter.fields ??
    getFieldIds(parameter)
      .map(id => metadata.field(id))
      .filter(f => f != null)
  );
}

export function getFieldIds(parameter) {
  const { field_ids = [], field_id } = parameter;
  const fieldIds = field_id ? [field_id] : field_ids;
  return fieldIds.filter(id => typeof id === "number");
}
