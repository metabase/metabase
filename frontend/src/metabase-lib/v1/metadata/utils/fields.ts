import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
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
} from "metabase-lib/v1/types/constants";
import { getFieldType } from "metabase-lib/v1/types/utils/isa";
import type { FieldId, FieldReference, TableId } from "metabase-types/api";

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

export function getUniqueFieldId({
  id,
  name,
  table_id,
}: {
  id: FieldId | FieldReference | string;
  name?: string | undefined | null;
  table_id?: TableId | undefined | null;
}): number | string {
  const fieldIdentifier = getFieldIdentifier({ id, name });

  if (isVirtualCardId(table_id)) {
    return `${table_id}:${fieldIdentifier}`;
  }

  return fieldIdentifier;
}

function getFieldIdentifier({
  id,
  name,
}: {
  id: FieldId | FieldReference | string;
  name?: string | undefined | null;
}): number | string {
  if (Array.isArray(id)) {
    return id[1];
  }

  return id ?? name;
}
