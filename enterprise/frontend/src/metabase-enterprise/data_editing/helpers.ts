import type { FieldWithMetadata } from "./tables/types";

export function canEditField(field?: FieldWithMetadata) {
  return (
    field && field.semantic_type !== "type/PK" && !field.database_is_generated
  );
}
