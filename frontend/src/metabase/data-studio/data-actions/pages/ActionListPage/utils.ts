import { t } from "ttag";

import { getCollectionIcon } from "metabase/common/collections/utils";
import { getUserName } from "metabase/utils/user";
import type {
  Collection,
  CollectionId,
  Database,
  IconName,
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

export function getCollectionNodeId(collectionId: CollectionId): string {
  return `collection-${collectionId}`;
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

/**
 * The expanded state that opens the collection node of `collectionId` and its ancestors, or every node without one.
 */
export function getDefaultExpanded(
  nodes: ActionTreeNode[],
  collectionId: CollectionId | undefined,
): Record<string, boolean> | true {
  if (collectionId == null) {
    return true;
  }
  const targetId = getCollectionNodeId(collectionId);
  const findPath = (nodes: ActionTreeNode[]): string[] | undefined => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [node.id];
      }
      const path = findPath(node.children ?? []);
      if (path != null) {
        return [node.id, ...path];
      }
    }
    return undefined;
  };
  const path = findPath(nodes) ?? [];
  return Object.fromEntries(path.map((id) => [id, true]));
}

export const getNodeId = (node: ActionTreeNode) => node.id;

export const getSubRows = (node: ActionTreeNode) => node.children;

export const isFilterable = (node: ActionTreeNode) =>
  node.nodeType === "action";

export const globalFilterFn = (
  row: { original: ActionTreeNode },
  _columnId: string,
  filterValue: string,
) =>
  row.original.nodeType === "action" &&
  row.original.name.toLowerCase().includes(String(filterValue).toLowerCase());

export function getDatabaseName(
  databases: Database[],
  action: WritebackAction | undefined,
): string {
  return (
    databases.find((database) => database.id === action?.database_id)?.name ??
    ""
  );
}

export function getCreatorName(action: WritebackAction | undefined): string {
  return action ? (getUserName(action.creator) ?? "") : "";
}

export function getEmptyMessage({
  hasActions,
  hasResults,
}: {
  hasActions: boolean;
  hasResults: boolean;
}): string | null {
  switch (true) {
    case !hasActions:
      return t`No actions yet`;
    case !hasResults:
      return t`No actions found`;
    default:
      return null;
  }
}
