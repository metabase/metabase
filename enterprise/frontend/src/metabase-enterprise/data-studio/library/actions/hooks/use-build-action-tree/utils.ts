import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import type { TreeItem } from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import type {
  Collection,
  CollectionId,
  WritebackAction,
} from "metabase-types/api";

// The data actions root has the same "root" id as the SQL snippets root, so its node needs its own key.
const DATA_ACTIONS_ROOT_NODE_KEY = "data-actions-root";

export function getActionCollectionNodeId(collection: Pick<Collection, "id">) {
  return isRootCollection(collection)
    ? `collection:${DATA_ACTIONS_ROOT_NODE_KEY}`
    : `collection:${collection.id}`;
}

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

function buildActionCollectionNode(
  collection: Collection,
  collections: Collection[],
  actions: WritebackAction[],
): TreeItem {
  const parentId = isRootCollection(collection) ? null : collection.id;
  const children = [
    ...collections
      .filter((child) => child.parent_id === parentId)
      .map((child) => buildActionCollectionNode(child, collections, actions)),
    ...actions
      .filter((action) => action.collection_id === parentId)
      .map(createActionNode),
  ];

  return {
    id: getActionCollectionNodeId(collection),
    name: collection.name,
    model: "collection",
    icon: isRootCollection(collection) ? "bolt" : "folder",
    data: { ...collection, model: "collection" },
    children: children.length > 0 ? children : undefined,
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
 * The data actions root with its folders and the actions without a model under it, or nothing without a readable root.
 */
export function buildActiveActionTree(
  actionCollections: Collection[],
  actions: WritebackAction[],
  canCreateActions: boolean,
): TreeItem[] {
  const rootCollection = actionCollections.find(isRootCollection);
  if (!rootCollection) {
    return [];
  }

  const collections = actionCollections.filter(
    (collection) => !collection.archived && !isRootCollection(collection),
  );
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const dataActions = actions.filter(
    (action) => !action.archived && isDataAction(action, collectionIds),
  );
  const rootNode = buildActionCollectionNode(
    rootCollection,
    collections,
    dataActions,
  );
  const hasContent = dataActions.length > 0 || collections.length > 0;

  return [
    {
      ...rootNode,
      name: t`Data actions`,
      children: hasContent
        ? rootNode.children
        : [createEmptyStateItem("actions", undefined, !canCreateActions)],
    },
  ];
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
      buildActionCollectionNode(collection, archivedCollections, dataActions),
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
