import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";
import {
  BOOLEAN,
  COORDINATE,
  FOREIGN_KEY,
  LOCATION,
  NUMBER,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  TEMPORAL,
} from "metabase-lib/types/constants";
import { getFieldType } from "metabase-lib/types/utils/isa";
import type Field from "../Field";

const ICON_MAPPING: Record<string, string> = {
  [TEMPORAL]: "calendar",
  [LOCATION]: "location",
  [COORDINATE]: "location",
  [STRING]: "string",
  [STRING_LIKE]: "string",
  [NUMBER]: "int",
  [BOOLEAN]: "io",
  [FOREIGN_KEY]: "connections",
  [PRIMARY_KEY]: "label",
};

/**
 * @deprecated use metabase-lib v2 + `getColumnIcon` from "metabase/common/utils/columns"
 */
export function getIconForField(fieldOrColumn: any) {
  const type = getFieldType(fieldOrColumn);
  return type && ICON_MAPPING[type] ? ICON_MAPPING[type] : "unknown";
}

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
