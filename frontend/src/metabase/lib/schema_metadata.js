import { field_semantic_types_map } from "metabase/lib/core";
import { getFieldType } from "metabase-lib/lib/types/utils/isa";
import {
  TEMPORAL,
  LOCATION,
  COORDINATE,
  FOREIGN_KEY,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  NUMBER,
  BOOLEAN,
} from "metabase-lib/lib/types/constants";

export function foreignKeyCountsByOriginTable(fks) {
  if (fks === null || !Array.isArray(fks)) {
    return null;
  }

  return fks
    .map(function (fk) {
      return "origin" in fk ? fk.origin.table.id : null;
    })
    .reduce(function (prev, curr, idx, array) {
      if (curr in prev) {
        prev[curr]++;
      } else {
        prev[curr] = 1;
      }

      return prev;
    }, {});
}

export const ICON_MAPPING = {
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

export function getIconForField(field) {
  return ICON_MAPPING[getFieldType(field)] || "unknown";
}

export function getSemanticTypeIcon(semanticType, fallback) {
  const semanticTypeMetadata = field_semantic_types_map[semanticType];
  return semanticTypeMetadata?.icon ?? fallback;
}

export function getSemanticTypeName(semanticType) {
  const semanticTypeMetadata = field_semantic_types_map[semanticType];
  return semanticTypeMetadata?.name;
}
