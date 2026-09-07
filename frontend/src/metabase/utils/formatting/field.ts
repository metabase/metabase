/**
 * The three names `formatField` chooses between, in order of preference. Both
 * the API field and the v1 `Field` wrapper match it.
 */
type FormattableField = {
  name: string;
  display_name: string;
  dimensions?: { name: string }[];
};

export function formatField(field: FormattableField) {
  if (!field) {
    return "";
  }

  return field.dimensions?.[0]?.name || field.display_name || field.name;
}
