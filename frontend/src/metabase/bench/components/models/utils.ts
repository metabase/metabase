import { getIcon } from "metabase/browse/models/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  type CollectionTreeItem,
  buildCollectionTree,
} from "metabase/entities/collections";
import type {
  Collection,
  CollectionContentModel,
  SearchResult,
} from "metabase-types/api";

export function getTreeItems(
  collections: Collection[],
  models: SearchResult[],
  itemType: CollectionContentModel,
): ITreeNodeItem[] {
  const collectionTree = buildCollectionTree(
    collections,
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
      .filter((collectionItem) => collectionItem.children?.length > 0),
    ...models
      .filter((m) => !m.collection.id)
      .map((m) => ({
        id: m.id,
        name: m.name,
        icon: getIcon(m),
      })),
  ];
}
