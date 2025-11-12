import type { Collection } from "metabase-types/api";

import { getSemanticLayerCollectionType } from "../../../utils";

export function getWritableSemanticCollections(rootCollection: Collection) {
  const modelsCollection = rootCollection.children?.find(
    (collection) =>
      getSemanticLayerCollectionType(collection) === "semantic-layer-models",
  );
  const metricsCollection = rootCollection.children?.find(
    (collection) =>
      getSemanticLayerCollectionType(collection) === "semantic-layer-metrics",
  );

  return {
    modelsCollection: modelsCollection?.can_write
      ? modelsCollection
      : undefined,
    metricsCollection: metricsCollection?.can_write
      ? metricsCollection
      : undefined,
  };
}
