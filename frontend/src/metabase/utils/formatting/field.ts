import type { Field } from "metabase-types/api/field";

export function formatField(field: Field) {
  if (!field) {
    return "";
  }

  return field.dimensions?.[0]?.name || field.display_name || field.name;
}
