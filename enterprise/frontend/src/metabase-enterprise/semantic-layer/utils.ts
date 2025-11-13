import type {
  Collection,
  SemanticLayerCollectionType,
} from "metabase-types/api";

export function getSemanticLayerCollectionType({
  type,
}: Partial<Collection>): SemanticLayerCollectionType | undefined {
  switch (type) {
    case "semantic-layer":
    case "semantic-layer-models":
    case "semantic-layer-metrics":
      return type;
  }
}

export function isSemanticLayerCollection({ type }: Partial<Collection>) {
  return type === "semantic-layer";
}
