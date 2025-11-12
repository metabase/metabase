import type { Collection } from "metabase-types/api";

import { getSemanticLayerCollectionType } from "../../../utils";

export function getSemanticCollections(rootCollection: Collection) {
  const modelCollection = rootCollection.children?.find(
    (collection) =>
      getSemanticLayerCollectionType(collection) === "semantic-layer-models",
  );
  const metricCollection = rootCollection.children?.find(
    (collection) =>
      getSemanticLayerCollectionType(collection) === "semantic-layer-metrics",
  );

  return {
    modelCollection,
    metricCollection,
  };
}
