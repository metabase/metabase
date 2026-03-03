import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import type { IconName } from "metabase-types/ui";

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
