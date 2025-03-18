import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";

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

export function getSemanticTypeIcon(semanticType, fallback) {
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.icon ?? fallback;
}

export function getSemanticTypeName(semanticType) {
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.name;
}
