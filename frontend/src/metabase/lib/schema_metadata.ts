import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import type { IconName } from "metabase/ui";

export function foreignKeyCountsByOriginTable(fks: unknown) {
  if (fks === null || !Array.isArray(fks)) {
    return null;
  }

  return fks
    .map(function (fk: Record<string, any>) {
      return fk.origin?.table?.id ?? null;
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

export function getSemanticTypeIcon(semanticType: string | null | undefined, fallback?: IconName): IconName | undefined {
  if (!semanticType) {
    return fallback;
  }
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.icon ?? fallback;
}

export function getSemanticTypeName(semanticType: string | null | undefined) {
  if (!semanticType) {
    return undefined;
  }
  const semanticTypeMetadata = FIELD_SEMANTIC_TYPES_MAP[semanticType];
  return semanticTypeMetadata?.name;
}
