import { getUrl as getUrl_ } from "../../utils";

import { CHILD_TYPES, UNNAMED_SCHEMA_NAME } from "./constants";
import type {
  CollectionNode,
  DatabaseNode,
  ExpandedState,
  FlatItem,
  ItemType,
  ModelNode,
  NodeKey,
  RootNode,
  TreeNode,
  TreePath,
} from "./types";

export function isItemWithHiddenExpandIcon(item: FlatItem): boolean {
  if (item.type === "model" || item.type === "table") {
    return true;
  }

  return false;
}

export function isLeafNode(item: FlatItem): boolean {
  return item.type === "model" || item.type === "table";
}

export function getUrl(value: TreePath) {
  return getUrl_({
    fieldId: undefined,
    tableId: undefined,
    databaseId: undefined,
    schemaName: undefined,

    modelId: undefined,
    fieldName: undefined,
    collectionId: undefined,
    ...value,
  });
}

// Returns a new state object with all the nodes along the path expanded.
export function expandPath(
  state: ExpandedState,
  path: TreePath,
): ExpandedState {
  return {
    ...state,
    [toKey({
      ...path,
      tableId: undefined,
    })]: true,
    [toKey({
      ...path,
      tableId: undefined,
      schemaName: undefined,
    })]: true,
    [toKey({
      ...path,
      tableId: undefined,
      schemaName: undefined,
      databaseId: undefined,
    })]: true,

    [toKey({
      ...path,
      modelId: undefined,
    })]: true,
    [toKey({
      ...path,
      modelId: undefined,
      collectionId: undefined,
    })]: true,
  };
}

/**
 * Convert a TreeNode into a flat list of items
 * that can easily be rendered using virtualization.
 *
 * This does other things like removing nameless schemas
 * from the tree and adding loading nodes.
 */
export function flatten(
  node: TreeNode,
  opts: {
    addLoadingNodes?: boolean;
    isExpanded?: (key: string) => boolean;
    isSingleSchema?: boolean;
    level?: number;
    parent?: NodeKey;
    canFlattenSingleSchema?: boolean;
  } = {},
): FlatItem[] {
  const {
    addLoadingNodes,
    isExpanded,
    isSingleSchema,
    canFlattenSingleSchema,
    level = 0,
    parent,
  } = opts;
  if (node.type === "root") {
    // root node doesn't render a title and is always expanded
    if (addLoadingNodes && node.children.length === 0) {
      return [
        loadingItem("database", level),
        loadingItem("database", level),
        loadingItem("collection", level),
        loadingItem("collection", level),
      ];
    }
    return node.children.flatMap((child) => flatten(child, opts));
  }

  if (
    node.type === "schema" &&
    (node.label === UNNAMED_SCHEMA_NAME ||
      (isSingleSchema && canFlattenSingleSchema))
  ) {
    // Hide nameless schemas in the tree
    return [
      ...node.children.flatMap((child) =>
        flatten(child, {
          ...opts,
          level,
          parent,
        }),
      ),
    ];
  }

  if (typeof isExpanded === "function" && !isExpanded(node.key)) {
    return [{ ...node, level, parent } as FlatItem];
  }

  if (addLoadingNodes && node.children.length === 0) {
    const childType = CHILD_TYPES[node.type];
    if (!childType) {
      return [{ ...node, level, parent }];
    }
    return [
      { ...node, isExpanded: true, level, parent },
      loadingItem(childType, level + 1, node),
    ];
  }

  return [
    { ...node, isExpanded: true, level, parent },
    ...node.children.flatMap((child) =>
      flatten(child, {
        ...opts,
        level: level + 1,
        parent: node.key,
        isSingleSchema: node.type === "database" && node.children.length === 1,
      }),
    ),
  ];
}

export function sort<T extends { label: string } = TreeNode>(nodes: T[]): T[] {
  return Array.from(nodes).sort((a, b) => {
    return a.label.localeCompare(b.label);
  });
}

/**
 * Merge two TreeNodes together.
 */
export function merge(
  a: TreeNode | undefined,
  b: TreeNode | undefined,
): TreeNode {
  if (!a) {
    if (!b) {
      throw new Error("Both a and b are undefined");
    }
    return b;
  }
  if (!b) {
    return a;
  }

  const len = Math.max(a.children.length, b.children.length);
  const children = [];

  for (let index = 0; index < len; index++) {
    const aa = a.children?.[index];
    const bb = b.children?.[index];
    children.push(merge(aa, bb));
  }

  return {
    ...a,
    ...b,
    // @ts-expect-error: we can't type the child node here correctly without checking all the combinations, just assume we are right.
    children,
  };
}

/**
 * Create a unique key for a TreePath
 */
export function toKey({
  databaseId,
  schemaName,
  tableId,
  collectionId,
  modelId,
}: TreePath) {
  return JSON.stringify([
    databaseId,
    schemaName,
    tableId,
    collectionId,
    modelId,
  ]);
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function node<T extends TreeNode>(
  x: Optional<T, "key" | "children">,
): T {
  return {
    ...x,
    key: toKey(x.value),
    children: x.children ?? [],
  } as T;
}

export function rootNode(
  children: (DatabaseNode | CollectionNode | ModelNode)[] = [],
): RootNode {
  return node<RootNode>({
    type: "root",
    label: "",
    value: {},
    children,
  });
}

export function loadingItem(
  type: ItemType,
  level: number,
  parent?: TreeNode,
): FlatItem {
  return {
    type,
    level,
    value: parent?.type === "root" ? undefined : parent?.value,
    parent: parent?.type === "root" ? undefined : parent?.key,
    isLoading: true,
    key: Math.random().toString(),
  };
}
