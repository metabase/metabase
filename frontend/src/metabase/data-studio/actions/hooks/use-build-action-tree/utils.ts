import { isRootCollection } from "metabase/common/collections/utils";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  buildCollectionTreeChildren,
  buildCollectionTreeNode,
  createEmptyStateItem,
} from "metabase/data-studio/common/utils";
import type {
  Collection,
  CollectionId,
  WritebackAction,
} from "metabase-types/api";

function createActionNode(action: WritebackAction): TreeItem {
  return {
    id: `action:${action.id}`,
    name: action.name,
    icon: "bolt",
    model: "action",
    data: {
      id: action.id,
      model: "action",
      name: action.name,
      description: action.description,
      collection_id: action.collection_id,
      archived: action.archived,
      can_write: action.can_write,
    },
    updatedAt: action.updated_at,
  };
}

function isDataAction(
  action: WritebackAction,
  collectionIds: Set<CollectionId>,
) {
  return (
    action.model_id == null &&
    (action.collection_id == null || collectionIds.has(action.collection_id))
  );
}

/**
 * The folders and actions without a model at the top of the data actions collection, an empty-state row when it holds
 * none, or nothing without a readable root.
 */
export function buildActiveActionTree(
  actionCollections: Collection[],
  actions: WritebackAction[],
  canCreateActions: boolean,
): TreeItem[] {
  if (!actionCollections.some(isRootCollection)) {
    return [];
  }

  const collections = actionCollections.filter(
    (collection) => !collection.archived && !isRootCollection(collection),
  );
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const dataActions = actions.filter(
    (action) => !action.archived && isDataAction(action, collectionIds),
  );
  const items = buildCollectionTreeChildren(
    null,
    collections,
    dataActions,
    createActionNode,
  );

  return items.length > 0
    ? items
    : [createEmptyStateItem("actions", undefined, !canCreateActions)];
}

/**
 * The archived data actions folders with their actions, followed by the archived actions outside of them.
 */
export function buildArchivedActionTree(
  archivedCollections: Collection[],
  archivedActions: WritebackAction[],
  activeCollections: Collection[],
): TreeItem[] {
  const collectionIds = new Set(
    archivedCollections.map((collection) => collection.id),
  );
  const dataActionCollectionIds = new Set([
    ...collectionIds,
    ...activeCollections.map((collection) => collection.id),
  ]);
  const topLevelCollections = archivedCollections.filter(
    (collection) =>
      collection.parent_id == null || !collectionIds.has(collection.parent_id),
  );
  const dataActions = archivedActions.filter((action) =>
    isDataAction(action, dataActionCollectionIds),
  );

  return [
    ...topLevelCollections.map((collection) =>
      buildCollectionTreeNode(
        collection,
        archivedCollections,
        dataActions,
        createActionNode,
      ),
    ),
    ...dataActions
      .filter(
        (action) =>
          action.collection_id == null ||
          !collectionIds.has(action.collection_id),
      )
      .map(createActionNode),
  ];
}
