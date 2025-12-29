import type { DatabaseId, TableId } from "metabase-types/api";

import { getSchemaId } from "./bulk-selection.utils";
import { UNNAMED_SCHEMA_NAME } from "./constants";
import type {
  DatabaseNode,
  ExpandedState,
  FilterState,
  RootNode,
  SchemaNode,
  TableNode,
  TablePickerTreeNode,
  TreeNode,
  TreePath,
} from "./types";

// Returns a new state object with all the nodes along the path expanded.
// Note: This only expands parent containers (database, schema) but NOT tables,
// to prevent unwanted expansion when navigating via checkbox selection.
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
  };
}

export function sort<T extends TreeNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Merge two TreeNodes together.
 */
export function merge(a: RootNode, b: RootNode): RootNode;
export function merge(
  a: TreeNode | undefined,
  b: TreeNode | undefined,
): TreeNode;
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

  const merged = { ...a, ...b };
  (merged as { children: TreeNode[] }).children = children;
  return merged;
}

/**
 * Create a unique key for a TreePath
 */
export function toKey({ databaseId, schemaName, tableId }: TreePath) {
  return JSON.stringify([databaseId, schemaName, tableId]);
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

export function rootNode(children: DatabaseNode[] = []): RootNode {
  return node<RootNode>({
    type: "root",
    label: "",
    value: {},
    children,
  });
}

export function getFiltersCount(filters: FilterState): number {
  let count = 0;

  if (filters.dataSource != null) {
    ++count;
  }

  if (filters.dataLayer != null) {
    ++count;
  }

  if (filters.ownerEmail != null || filters.ownerUserId != null) {
    ++count;
  }

  if (filters.unusedOnly === true) {
    ++count;
  }

  return count;
}

export function transformToTreeTableFormat(
  tree: RootNode,
  canFlattenSingleSchema = true,
): TablePickerTreeNode[] {
  return sort(tree.children).map((database) =>
    transformDatabaseNode(database, canFlattenSingleSchema),
  );
}

function transformDatabaseNode(
  database: DatabaseNode,
  canFlattenSingleSchema: boolean,
): TablePickerTreeNode {
  const { databaseId } = database.value;
  const isSingleSchema = database.children.length === 1;
  const shouldFlattenSingleSchema = canFlattenSingleSchema && isSingleSchema;

  let children: TablePickerTreeNode[];
  if (shouldFlattenSingleSchema && database.children[0]) {
    const singleSchema = database.children[0];
    children = sort(singleSchema.children).map((table) =>
      transformTableNode(table),
    );
  } else {
    children = sort(database.children).flatMap((schema) => {
      if (schema.label === UNNAMED_SCHEMA_NAME) {
        return sort(schema.children).map((table) => transformTableNode(table));
      }
      return [transformSchemaNode(schema)];
    });
  }

  return {
    id: `db:${databaseId}`,
    type: "database",
    name: database.label,
    nodeKey: database.key,
    databaseId,
    children,
  };
}

function transformSchemaNode(schema: SchemaNode): TablePickerTreeNode {
  const { databaseId, schemaName } = schema.value;

  return {
    id: `schema:${databaseId}:${schemaName}`,
    type: "schema",
    name: schema.label,
    nodeKey: schema.key,
    databaseId,
    schemaName,
    children: sort(schema.children).map((table) => transformTableNode(table)),
  };
}

function transformTableNode(table: TableNode): TablePickerTreeNode {
  const { databaseId, schemaName, tableId } = table.value;

  return {
    id: `table:${tableId}`,
    type: "table",
    name: table.label,
    nodeKey: table.key,
    databaseId,
    schemaName,
    tableId,
    table: table.table,
    isDisabled: table.disabled,
    children: [],
  };
}

export function nodeToTreePath(node: TablePickerTreeNode): TreePath {
  return {
    databaseId: node.databaseId,
    schemaName: node.schemaName,
    tableId: node.tableId,
  };
}

export function findSelectedTableNodes(
  tree: RootNode,
  selectedTables: Set<TableId>,
): TableNode[] {
  const result: TableNode[] = [];
  for (const db of tree.children) {
    for (const schema of db.children) {
      for (const table of schema.children) {
        if (selectedTables.has(table.value.tableId)) {
          result.push(table);
        }
      }
    }
  }
  return result;
}

export function getExpandedSelectedSchemas(
  tree: RootNode,
  selectedSchemas: Set<string>,
  isExpanded: (key: string) => boolean,
): SchemaNode[] {
  const result: SchemaNode[] = [];
  for (const db of tree.children) {
    for (const schema of db.children) {
      if (
        selectedSchemas.has(getSchemaId(schema)) &&
        isExpanded(schema.key) &&
        schema.children.length > 0
      ) {
        result.push(schema);
      }
    }
  }
  return result;
}

export function getExpandedSelectedDatabases(
  tree: RootNode,
  selectedDatabases: Set<DatabaseId>,
  isExpanded: (key: string) => boolean,
): DatabaseNode[] {
  const result: DatabaseNode[] = [];
  for (const db of tree.children) {
    if (
      selectedDatabases.has(db.value.databaseId) &&
      isExpanded(db.key) &&
      db.children.length > 0
    ) {
      result.push(db);
    }
  }
  return result;
}

export function hasManuallySelectedTables(
  schema: SchemaNode,
  selectedTables: Set<TableId>,
): boolean {
  return schema.children.some((table) =>
    selectedTables.has(table.value.tableId),
  );
}

export function hasManuallySelectedSchemas(
  database: DatabaseNode,
  selectedSchemas: Set<string>,
): boolean {
  return database.children.some((schema) =>
    selectedSchemas.has(getSchemaId(schema)),
  );
}
