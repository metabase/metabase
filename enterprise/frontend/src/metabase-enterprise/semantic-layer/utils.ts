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
    return;
  }

  const types = allowed_content ?? [];
  if (types.includes("dataset") && !types.includes("metric")) {
    return "models";
  }
  if (types.includes("metric") && !types.includes("dataset")) {
    return "metrics";
  }
}
