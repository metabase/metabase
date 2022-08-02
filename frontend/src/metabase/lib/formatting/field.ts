import { Field } from "metabase-types/types/Field";

export function formatField(field: Field) {
  if (!field) {
    return "";
  }

  return field.dimensions?.name || field.display_name || field.name;
}
