import { isVirtualCardId } from "metabase/lib/saved-questions/saved-questions";
import type Field from "./Field";

function getFieldIdentifier(field: Field): number | string {
  const { id, name } = field;
  if (Array.isArray(id)) {
    return id[1];
  }

  return id || name;
}

export function getUniqueFieldId(field: Field): number | string {
  const { table_id } = field;
  const fieldIdentifier = getFieldIdentifier(field);

  if (isVirtualCardId(table_id)) {
    return `${table_id}:${fieldIdentifier}`;
  }

  return fieldIdentifier;
}
