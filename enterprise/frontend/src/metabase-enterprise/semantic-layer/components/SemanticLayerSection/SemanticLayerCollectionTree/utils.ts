import type {
  Collection,
  SemanticLayerCollectionType,
} from "metabase-types/api";

import { getSemanticLayerCollectionType } from "../../../utils";

export function getWritableSemanticCollection(
  rootCollection: Collection,
  type: SemanticLayerCollectionType,
) {
  const collection = rootCollection.children?.find(
    (collection) => getSemanticLayerCollectionType(collection) === type,
  );
  return collection?.can_write ? collection : undefined;
}
