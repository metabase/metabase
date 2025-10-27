import type { DatabaseId, TableId } from "metabase-types/api";

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

  const isSelected = selection ? isItemSelected(node, selection) : "no";

  if (typeof isExpanded === "function" && !isExpanded(node.key)) {
    return [{ ...node, level, parent, isSelected: isSelected } as FlatItem];
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
    {
      ...node,
      isExpanded: true,
      level,
      parent,
      isSelected,
    },
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

export interface NodeSelection {
  tables: Set<TableId>;
  schemas: Set<string>;
  databases: Set<DatabaseId>;
}

export function isItemSelected(
  node: TreeNode,
  selection: NodeSelection,
): "yes" | "no" | "some" {
  if (!selection) {
    return "no";
  }
  if (node.type === "table") {
    return selection.tables.has(node.value?.tableId ?? -1) ? "yes" : "no";
  }
  if (node.type === "schema") {
    if (selection.schemas.has(getSchemaId(node) ?? "")) {
      return "yes";
    }

    return areChildTablesSelected(node, selection.tables);
  }
  if (node.type === "database") {
    if (selection.databases.has(node.value?.databaseId ?? -1)) {
      return "yes";
    }
    return areChildSchemasSelected(node, selection);
  }

  return "no";
}

function areChildTablesSelected(
  node: TreeNode,
  selectedTables: Set<TableId> | undefined,
): "yes" | "no" | "some" {
  if (node.children.length === 0) {
    return "no";
  }

  const selectedTablesCount = node.children.filter(
    (x) => x.type === "table" && selectedTables?.has(x.value?.tableId ?? ""),
  ).length;

  return selectedTablesCount === node.children.length
    ? "yes"
    : selectedTablesCount > 0
      ? "some"
      : "no";
}

function areChildSchemasSelected(
  node: TreeNode,
  selection: NodeSelection,
): "yes" | "no" | "some" {
  if (node.children.length === 0) {
    return "no";
  }

  const selectedSchemasResult = node.children.map((x) =>
    isItemSelected(x, selection),
  );

  return selectedSchemasResult.every((x) => x === "yes")
    ? "yes"
    : selectedSchemasResult.every((x) => x === "no")
      ? "no"
      : "some";
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

export function getSchemaId(item: FlatItem) {
  if (item.type !== "table" && item.type !== "schema") {
    return undefined;
  }
  return `${item.value?.databaseId}:${item.value?.schemaName}`;
}

export function isParentSchemaSelected(
  item: FlatItem,
  selectedSchemas: Set<string> | undefined,
) {
  if (item.type !== "table") {
    return false;
  }

  const parentSchemaId = getSchemaId(item);

  if (!parentSchemaId) {
    return false;
  }

  return selectedSchemas?.has(parentSchemaId);
}

export function noManuallySelectedTables(
  schema: FlatItem | undefined,
  items: FlatItem[],
  selectedItems: Set<TableId> | undefined,
) {
  if (!schema) {
    return false;
  }
  // return true;
  const children = items.filter((x) => x.parent === schema.key);

  return !children.some(
    (child) =>
      child.type === "table" && selectedItems?.has(child.value?.tableId ?? ""),
  );
}

export function noManuallySelectedSchemas(
  database: FlatItem | undefined,
  items: FlatItem[],
  selectedSchemas: Set<string> | undefined,
) {
  if (!database) {
    return false;
  }
  // return true;
  const children = items.filter((x) => x.parent === database.key);

  return !children.some(
    (child) =>
      child.type === "schema" && selectedSchemas?.has(getSchemaId(child) ?? ""),
  );
}

export function noManuallySelectedDatabaseChildrenTables(
  database: DatabaseNode,
  selectedTables: Set<TableId> | undefined,
) {
  if (!database) {
    return false;
  }

  const answer = !database.children.some(
    (schema) =>
      schema.type === "schema" &&
      schema.children.some(
        (child) =>
          child.type === "table" &&
          selectedTables?.has(child.value?.tableId ?? -1),
      ),
  );

  return answer;
}

export function getParentSchema(tableItem: FlatItem, allItems: FlatItem[]) {
  return allItems.find(
    (x) => x.type === "schema" && getSchemaId(x) === getSchemaId(tableItem),
  );
}

export function getSchemaTables(schema: FlatItem, allItems: FlatItem[]) {
  const result = allItems.filter(
    (x) =>
      x.type === "table" &&
      getSchemaId(schema) === getSchemaId(x) &&
      x.value?.tableId,
  );

  return result;
}

export function getSchemaTableIds(schema: FlatItem, allItems: FlatItem[]) {
  return getSchemaTables(schema, allItems).map((x) => x.value?.tableId ?? "");
}

export function getSchemaChildrenTableIds(schema: TreeNode) {
  return schema.children
    .filter((x) => x.type === "table")
    .map((x) => x.value?.tableId ?? -1);
}

export function getParentSchemaTables(item: FlatItem, allItems: FlatItem[]) {
  const parentSchema = getParentSchema(item, allItems);

  if (!parentSchema) {
    return [];
  }

  return allItems.filter(
    (x) => x.type === "table" && getSchemaId(parentSchema) === getSchemaId(x),
  );
}

export function areTablesSelected(
  schema: FlatItem,
  allItems: FlatItem[],
  selectedItems: Set<TableId> | undefined,
): "all" | "some" | "none" {
  const tables = getSchemaTables(schema, allItems);
  if (tables.length === 0) {
    return "none";
  }
  if (tables.every((x) => selectedItems?.has(x.value?.tableId ?? ""))) {
    return "all";
  }
  if (tables.some((x) => selectedItems?.has(x.value?.tableId ?? ""))) {
    return "some";
  }
  return "none";
}

export function getSchemas(database: FlatItem, allItems: FlatItem[]) {
  return allItems.filter(
    (x) =>
      x.type === "schema" && x.value?.databaseId === database.value?.databaseId,
  );
}

export function getChildSchemas(databaseNode: DatabaseNode) {
  return databaseNode.children.filter((x) => x.type === "schema");
}

export function areSchemasSelected(
  database: FlatItem,
  allItems: FlatItem[],
  selectedSchemas: Set<string> | undefined,
  selectedItems: Set<TableId> | undefined,
): "all" | "some" | "none" {
  if (database.type !== "database") {
    return "none";
  }

  const schemas = getSchemas(database, allItems);
  if (schemas.length === 0) {
    return "none";
  }

  if (
    schemas.every(
      (x) =>
        selectedSchemas?.has(getSchemaId(x) ?? "") ||
        areTablesSelected(x, x.children, selectedItems) === "all",
    )
  ) {
    return "all";
  }
  if (
    schemas.some(
      (x) =>
        selectedSchemas?.has(getSchemaId(x) ?? "") ||
        areTablesSelected(x, x.children, selectedItems) !== "none",
    )
  ) {
    return "some";
  }
  return "none";
}
