import { is_coerceable } from "cljs/metabase.types";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, SchemaName, Table } from "metabase-types/api";

import { getSchemaDisplayName } from "./schema";

/**
 * Predicate to decide whether `a` is comparable with `b`.
 *
 * Currently only the MongoBSONID erroneous case is ruled out to fix the issue #49149. To the best of my knowledge
 * there's no logic on FE to reliably decide whether two columns are comparable. Trying to come up with that in ad-hoc
 * manner could disable some cases that users may depend on.
 */
export function areFieldsComparable(a: Field, b: Field): boolean {
  return a.effective_type === "type/MongoBSONID" ||
    b.effective_type === "type/MongoBSONID"
    ? a.effective_type === b.effective_type
    : true;
}

export function canCoerceFieldType(field: Field): boolean {
  return !isTypeFK(field.semantic_type) && is_coerceable(field.base_type);
}

export function getRawTableFieldId(field: Field): FieldId {
  if (typeof field.id !== "number") {
    throw new Error("getRawFieldId supports only raw table fields");
  }

  return field.id;
}

export function getFieldDisplayName(field: Field): string;
export function getFieldDisplayName(
  field: Field,
  table: Table | undefined,
): string;
export function getFieldDisplayName(
  field: Field,
  table: Table | undefined,
  schema: SchemaName | undefined,
): string;
export function getFieldDisplayName(
  field: Field,
  table?: Table | undefined,
  schema?: SchemaName | undefined,
): string {
  const fieldDisplayName =
    field.dimensions?.[0]?.name ||
    field.display_name ||
    field.name ||
    NULL_DISPLAY_VALUE;

  if (table) {
    if (schema) {
      return `${getSchemaDisplayName(schema)}.${table.display_name} → ${fieldDisplayName}`;
    }

    return `${table.display_name} → ${fieldDisplayName}`;
  }

  return fieldDisplayName;
}
