import { is_coerceable } from "cljs/metabase.types";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

export function canCoerceFieldType(field: Field) {
  return !isTypeFK(field.semantic_type) && is_coerceable(field.base_type);
}
