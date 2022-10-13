import { isVirtualCardId } from "metabase-lib/lib/metadata/utils/saved-questions";
import type Field from "../Field";

export function getUniqueFieldId(field: Field): number | string {
  const { table_id } = field;
  const fieldIdentifier = getFieldIdentifier(field);

  if (isVirtualCardId(table_id)) {
    return `${table_id}:${fieldIdentifier}`;
  }

  return fieldIdentifier;
}

function getFieldIdentifier(field: Field): number | string {
  const { id, name } = field;
  if (Array.isArray(id)) {
    return id[1];
  }

  return id || name;
}
