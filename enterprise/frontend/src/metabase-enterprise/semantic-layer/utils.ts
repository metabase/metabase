import type { CollectionType } from "metabase-types/api";

export function isSemanticLayerCollectionType(
  type: CollectionType | undefined,
) {
  return type === "semantic-layer";
}
