export function hasFieldValues(parameter) {
  if (!Array.isArray(parameter.fields)) {
    return false;
  }

  return parameter.fields.some(field => field.hasFieldValues());
}

export function hasFields(parameter) {
  const { fields } = parameter;
  return Array.isArray(fields) && fields.length > 0;
}
