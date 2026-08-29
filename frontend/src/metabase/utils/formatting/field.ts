import type { Field } from "metabase-types/api/field";

type FormattableField = Pick<Field, "name" | "display_name" | "dimensions">;

export function formatField(field: FormattableField) {
  if (!field) {
    return "";
  }

  return field.dimensions?.[0]?.name || field.display_name || field.name;
}
