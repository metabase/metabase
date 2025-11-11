import type { SemanticLayerCollectionType } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

export function isSemanticLayerCollection({ type }: Partial<Collection>) {
  return type === "semantic-layer";
}

export function getSemanticLayerCollectionType({
  type,
}: Partial<Collection>): SemanticLayerCollectionType | undefined {
  if (type !== "semantic-layer") {
    return undefined;
  }
  return "root";
}
