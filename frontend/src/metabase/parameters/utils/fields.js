export function hasFieldValues(parameter) {
  return parameter.fields.some(field => field.hasFieldValues());
}
