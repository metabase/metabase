import { isSyncCompleted } from "metabase/lib/syncing";
import type { CardId, SearchResult, TableId } from "metabase-types/api";

import { getUrl as getUrl_ } from "../../utils";

import { type NodeSelection, isItemSelected } from "./bulk-selection.utils";
import {
  CHILD_TYPES,
  LEAF_ITEM_ICON_COLOR,
  UNNAMED_SCHEMA_NAME,
} from "./constants";
import type {
  CollectionNode,
  DatabaseNode,
  ExpandedState,
  FilterState,
  FlatItem,
  ItemType,
  ModelNode,
  NodeKey,
  RootNode,
  SchemaNode,
  TableNode,
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
    selection?: NodeSelection;
  } = {},
): FlatItem[] {
  const {
    addLoadingNodes,
    isExpanded,
    isSingleSchema,
    canFlattenSingleSchema,
    level = 0,
    parent,
    selection,
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

  const isSelected = selection ? isItemSelected(node, selection) : "no";

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
    return [{ ...node, level, parent, isSelected } as FlatItem];
  }

  if (addLoadingNodes && node.children.length === 0) {
    const childType = CHILD_TYPES[node.type];
    if (!childType) {
      return [{ ...node, level, parent, isSelected }];
    }
    return [
      { ...node, isExpanded: true, level, parent, isSelected },
      loadingItem(childType, level + 1, node),
    ];
  }

  return [
    { ...node, isExpanded: true, level, parent, isSelected },
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

export function buildTreeFromSearchResults(
  searchResults:
    | (SearchResult<TableId, "table"> | SearchResult<CardId, "dataset">)[]
    | undefined,
): TreeNode {
  const tree: TreeNode = rootNode();

  searchResults?.forEach((result) => {
    const { model, id, name } = result;

    if (model === "table") {
      const { database_name, database_id, table_schema } = result;
      const tableSchema = table_schema ?? "";

      let databaseNode = tree.children.find(
        (node) =>
          node.type === "database" && node.value.databaseId === database_id,
      ) as DatabaseNode | undefined;
      if (!databaseNode) {
        databaseNode = node<DatabaseNode>({
          type: "database",
          label: database_name || "",
          value: {
            databaseId: database_id,
          },
        });
        tree.children.push(databaseNode);
      }

      let schemaNode = databaseNode.children.find((node) => {
        return node.type === "schema" && node.value.schemaName === tableSchema;
      }) as SchemaNode | undefined;
      if (!schemaNode) {
        schemaNode = node<SchemaNode>({
          type: "schema",
          label: tableSchema,
          value: {
            databaseId: database_id,
            schemaName: tableSchema,
          },
        });
        databaseNode.children.push(schemaNode);
      }

      let tableNode = schemaNode.children.find(
        (node) => node.type === "table" && node.value.tableId === id,
      );
      if (!tableNode) {
        tableNode = node<TableNode>({
          type: "table",
          label: name,
          value: {
            databaseId: database_id,
            schemaName: tableSchema,
            tableId: id,
          },
          icon: { name: "table2", color: LEAF_ITEM_ICON_COLOR },
          disabled: !isSyncCompleted(result),
        });
        schemaNode.children.push(tableNode);
      }
    } else if (model === "dataset") {
      const { collection } = result;
      const collectionId = collection.id;

      if (!collectionId) {
        const rootModelNode = node<ModelNode>({
          type: "model",
          label: name,
          value: {
            collectionId: "root",
            modelId: id,
          },
          icon: { name: "model", color: LEAF_ITEM_ICON_COLOR },
        });
        tree.children.push(rootModelNode);
      } else {
        let collectionNode = tree.children.find(
          (node) =>
            node.type === "collection" &&
            node.value.collectionId === collectionId,
        ) as CollectionNode | undefined;
        if (!collectionNode) {
          collectionNode = node<CollectionNode>({
            type: "collection",
            label: collection.name,
            value: {
              collectionId,
            },
            icon: { name: "collection" },
          });
          tree.children.push(collectionNode);
        }

        let modelNode = collectionNode.children.find(
          (node) => node.type === "model" && node.value.modelId === id,
        );
        if (!modelNode) {
          modelNode = node<ModelNode>({
            type: "model",
            label: name,
            value: {
              collectionId,
              modelId: id,
            },
            icon: { name: "model", color: LEAF_ITEM_ICON_COLOR },
          });
          collectionNode.children.push(modelNode);
        }
      }
    }
  });

  return tree;
}

export function getFiltersCount(filters: FilterState): number {
  let count = 0;

  if (filters.visibilityType != null) {
    ++count;
  }

  if (filters.dataSource != null) {
    ++count;
  }

  if (filters.visibilityType2 != null) {
    ++count;
  }

  if (filters.ownerEmail != null || filters.ownerUserId != null) {
    ++count;
  }

  return count;
}
