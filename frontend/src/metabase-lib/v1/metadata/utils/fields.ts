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
import type { FieldId, FieldReference } from "metabase-types/api";

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
}: {
  id: FieldId | FieldReference | string;
  name?: string | undefined | null;
}): number | string {
  return getFieldIdentifier({ id, name });
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
