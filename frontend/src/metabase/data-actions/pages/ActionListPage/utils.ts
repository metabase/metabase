import { getCollectionIcon } from "metabase/common/collections/utils";
import type {
  Collection,
  CollectionId,
  IconName,
  UserId,
  WritebackAction,
} from "metabase-types/api";

export type ActionTreeNode = {
  id: string;
  name: string;
  nodeType: "folder" | "action";
  icon: IconName;
  action?: WritebackAction;
  children?: ActionTreeNode[];
};

export type ActionFilters = {
  databaseId: number | null;
  creatorId: UserId | null;
};

export function getCollectionNodeId(collectionId: CollectionId): string {
  return `collection-${collectionId}`;
}

export function filterActions(
  actions: WritebackAction[],
  { databaseId, creatorId }: ActionFilters,
): WritebackAction[] {
  return actions.filter(
    (action) =>
      (databaseId == null || action.database_id === databaseId) &&
      (creatorId == null || action.creator_id === creatorId),
  );
}

function buildActionNode(action: WritebackAction): ActionTreeNode {
  return {
    id: `action-${action.id}`,
    name: action.name,
    nodeType: "action",
    icon: "bolt",
    action,
  };
}

/**
 * The collections holding `actions` as a tree, with each action under its collection and empty branches dropped.
 */
export function buildActionTree(
  collections: Collection[],
  actions: WritebackAction[],
): ActionTreeNode[] {
  const actionsByCollectionId = new Map<
    CollectionId | null,
    WritebackAction[]
  >();
  for (const action of actions) {
    const group = actionsByCollectionId.get(action.collection_id) ?? [];
    group.push(action);
    actionsByCollectionId.set(action.collection_id, group);
  }

  const placedCollectionIds = new Set<CollectionId>();

  function buildCollectionNode(collection: Collection): ActionTreeNode | null {
    placedCollectionIds.add(collection.id);
    const childFolders = (collection.children ?? []).flatMap((child) => {
      const node = buildCollectionNode(child);
      return node ? [node] : [];
    });
    const childActions = (actionsByCollectionId.get(collection.id) ?? []).map(
      buildActionNode,
    );
    if (childFolders.length === 0 && childActions.length === 0) {
      return null;
    }
    return {
      id: getCollectionNodeId(collection.id),
      name: collection.name,
      nodeType: "folder",
      icon: getCollectionIcon(collection).name,
      children: [...childFolders, ...childActions],
    };
  }

  const folders = collections.flatMap((collection) => {
    const node = buildCollectionNode(collection);
    return node ? [node] : [];
  });
  const topLevelActions = actions
    .filter(
      (action) =>
        action.collection_id == null ||
        !placedCollectionIds.has(action.collection_id),
    )
    .map(buildActionNode);

  return [...folders, ...topLevelActions];
}
