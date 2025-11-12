import { getSemanticLayerCollectionType } from "metabase/collections/utils";
import type {
  Collection,
  SemanticLayerCollectionType,
} from "metabase-types/api";

export function getWritableSemanticCollection(
  rootCollection: Collection,
  type: SemanticLayerCollectionType,
) {
  const collection = rootCollection.children?.find(
    (collection) => getSemanticLayerCollectionType(collection) === type,
  );
  return collection?.can_write ? collection : undefined;
}
