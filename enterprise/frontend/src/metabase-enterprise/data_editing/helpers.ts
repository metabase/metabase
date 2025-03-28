import type { FieldWithMetadata } from "metabase-types/api";

export function canEditField(field?: FieldWithMetadata) {
  return (
    field && field.semantic_type !== "type/PK" && !field.database_is_generated
  );
}
