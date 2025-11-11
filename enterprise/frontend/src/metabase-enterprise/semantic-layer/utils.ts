import type { Collection } from "metabase-types/api";

export function isSemanticLayerCollection({ type }: Partial<Collection>) {
  return type === "semantic-layer";
}
