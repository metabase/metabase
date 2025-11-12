import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  ROOT_COLLECTION,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import { PLUGIN_SEMANTIC_LAYER } from "metabase/plugins";
import type { Collection, User } from "metabase-types/api";

export function getCollectionTree(
  collections: Collection[],
  currentUser: User,
): ITreeNodeItem[] {
  const preparedCollections = [
    ...currentUserPersonalCollections(collections, currentUser.id),
    ...collections.filter(
      (collection) =>
        nonPersonalOrArchivedCollection(collection) &&
        PLUGIN_SEMANTIC_LAYER.getSemanticLayerCollectionType(collection) ==
          null,
    ),
  ];

  const rootCollection = {
    ...ROOT_COLLECTION,
    icon: getCollectionIcon(ROOT_COLLECTION),
    children: buildCollectionTree(preparedCollections),
  };

  return [rootCollection];
}
