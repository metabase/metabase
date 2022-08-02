export function formatField(field) {
  if (!field) {
    return "";
  }

  return field.dimensions?.name || field.display_name || field.name;
}
