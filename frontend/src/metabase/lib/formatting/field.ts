import { Field } from "metabase-types/api/field";

export function formatField(field: Field) {
  if (!field) {
    return "";
  }

  return field.dimensions?.name || field.display_name || field.name;
}
