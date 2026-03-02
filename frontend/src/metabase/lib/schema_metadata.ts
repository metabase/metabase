import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import type { IconName } from "metabase/ui";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";

export function foreignKeyCountsByOriginTable(fks: ForeignKey[]) {
  return fks
    .map(function (fk) {
      return fk.origin?.table?.id ?? undefined;
    })
    .reduce<Record<number | string, number>>(function (prev, curr) {
      if (curr !== undefined) {
        if (curr in prev) {
          prev[curr]++;
        } else {
          prev[curr] = 1;
        }
      }

      return prev;
    }, {});
}

export function getSemanticTypeIcon(
  semanticType: string | null | undefined,
  fallback?: IconName,
): IconName | undefined {
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
