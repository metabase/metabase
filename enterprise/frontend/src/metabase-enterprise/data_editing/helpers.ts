import type { Field } from "metabase-types/api";

export function canEditField(field?: Field) {
  return (
    field && field.semantic_type !== "type/PK" && !field.database_is_generated
  );
}
