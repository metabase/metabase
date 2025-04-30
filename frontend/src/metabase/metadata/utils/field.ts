import { is_coerceable } from "cljs/metabase.types";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

export function canCoerceFieldType(field: Field) {
  return !isTypeFK(field.semantic_type) && is_coerceable(field.base_type);
}

export function getRawTableFieldId(field: Field): FieldId {
  if (typeof field.id !== "number") {
    throw new Error("getRawFieldId supports only raw table fields");
  }

  return field.id;
}

export function getFieldDisplayName(field: Field): string {
  return (
    field.dimensions?.[0]?.name ||
    field.display_name ||
    field.name ||
    NULL_DISPLAY_VALUE
  );
}
