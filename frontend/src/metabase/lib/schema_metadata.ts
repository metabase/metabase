import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";

export function foreignKeyCountsByOriginTable(
  fks: { origin?: { table: { id: number } } }[] | null,
) {
  if (fks === null || !Array.isArray(fks)) {
    return null;
  }

  return fks
    .map(function (fk) {
      return "origin" in fk && fk.origin ? fk.origin.table.id : null;
    })
    .reduce<Record<number, number>>(function (prev, curr) {
      if (curr != null) {
        if (curr in prev) {
          prev[curr]++;
        } else {
          prev[curr] = 1;
        }
      }

      return prev;
    }, {});
}

export function getSemanticTypeIcon(semanticType: string, fallback?: string) {
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.icon ?? fallback;
}

export function getSemanticTypeName(semanticType: string) {
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.name;
}
