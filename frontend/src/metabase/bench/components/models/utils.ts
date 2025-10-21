import { t } from "ttag";

import { getIcon } from "metabase/browse/models/utils";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  type CollectionTreeItem,
  PERSONAL_COLLECTIONS,
  buildCollectionTree,
} from "metabase/entities/collections";
import type {
  Collection,
  CollectionContentModel,
  SearchResult,
} from "metabase-types/api";

export const getGroupedTreeItems = (
  collections: Collection[],
  userId: number,
) => {
  const userPersonalCollections = currentUserPersonalCollections(
    collections,
    userId,
  );
  const otherPersonalCollections = collections.filter(
    (c) => c.personal_owner_id != null && c.personal_owner_id !== userId,
  );
  const hasOtherPersonalItem = otherPersonalCollections.some(
    (c) => c.here?.includes("dataset") || c.below?.includes("dataset"),
  );
  const otherPersonalCollectionsRoot: Collection | null = hasOtherPersonalItem
    ? {
        id: PERSONAL_COLLECTIONS.id,
        name: t`Other users' personal collections`,
        description: "",
        can_write: false,
        can_restore: false,
        can_delete: false,
        archived: false,
        location: "/",
        here: ["dataset"],
        children: otherPersonalCollections,
      }
    : null;

  const nonPersonalOrArchivedCollections = collections.filter(
    nonPersonalOrArchivedCollection,
  );

  return [
    ...userPersonalCollections,
    ...nonPersonalOrArchivedCollections,
    ...(otherPersonalCollectionsRoot ? [otherPersonalCollectionsRoot] : []),
  ];
};

export function getTreeItems(
  collections: Collection[],
  models: SearchResult[],
  itemType: CollectionContentModel,
  userId: number,
): ITreeNodeItem[] {
  const preparedCollections = getGroupedTreeItems(collections, userId);

  const collectionTree = buildCollectionTree(
    preparedCollections,
    (m) => m === itemType,
  );

  function collectionToTreeNode(collection: CollectionTreeItem): ITreeNodeItem {
    const modelsInCollection = models.filter(
      (model) => model.collection.id === collection.id,
    );

    const modelNodes = modelsInCollection.map(
      (model): ITreeNodeItem => ({
        id: model.id,
        name: model.name,
        icon: getIcon(model),
      }),
    );

    const childCollectionNodes = collection.children.map(collectionToTreeNode);

    return {
      id: `collection-${collection.id}`,
      name: collection.name,
      icon: collection.icon || "folder",
      children: [...childCollectionNodes, ...modelNodes],
    };
  }

  return [
    ...collectionTree
      .map(collectionToTreeNode)
      .filter((collectionItem) => (collectionItem.children?.length || 0) > 0),
    ...models
      .filter((m) => !m.collection.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        icon: getIcon(m),
      })),
  ];
}
