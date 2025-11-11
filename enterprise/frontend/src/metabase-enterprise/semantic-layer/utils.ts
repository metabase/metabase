import type { SemanticLayerCollectionType } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

export function isSemanticLayerCollection({ type }: Partial<Collection>) {
  return type === "semantic-layer";
}

export function getSemanticLayerCollectionType({
  type,
  allowed_content,
}: Partial<Collection>): SemanticLayerCollectionType | undefined {
  if (type !== "semantic-layer") {
    return undefined;
  }

  if (allowed_content?.includes("dataset")) {
    return "models";
  }
  if (allowed_content?.includes("metric")) {
    return "metrics";
  }
  return "root";
}
