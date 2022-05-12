export function hasFieldValues(parameter) {
  if (Array.isArray(parameter.values)) {
    return parameter.fields.some(field => field.hasFieldValues());
  }

  return false;
}
