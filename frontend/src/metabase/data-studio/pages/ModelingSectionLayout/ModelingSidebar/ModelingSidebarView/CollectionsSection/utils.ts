import {
  currentUserPersonalCollections,
  isSemanticLayerCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  ROOT_COLLECTION,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import type {
  Collection,
  CollectionContentModel,
  User,
} from "metabase-types/api";

export function getCollectionTree(
  collections: Collection[],
  currentUser: User,
): ITreeNodeItem[] {
  const preparedCollections = [
    ...currentUserPersonalCollections(collections, currentUser.id),
    ...collections.filter(
      (collection) =>
        nonPersonalOrArchivedCollection(collection) &&
        !isSemanticLayerCollection(collection),
    ),
  ];

  const modelFilter = (model: CollectionContentModel) =>
    model === "dataset" || model === "metric";

  const rootCollection = {
    ...ROOT_COLLECTION,
    icon: getCollectionIcon(ROOT_COLLECTION),
    children: buildCollectionTree(preparedCollections, modelFilter),
  };

  return [rootCollection];
}
