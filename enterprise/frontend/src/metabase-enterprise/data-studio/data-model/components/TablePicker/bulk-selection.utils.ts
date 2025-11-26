import type { DatabaseId, TableId } from "metabase-types/api";

import type { DatabaseNode, ExpandedItem, FlatItem, TreeNode } from "./types";
import { isExpandedItem, isSchemaNode, isTableNode } from "./types";

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
    return selection.tables.has(node.value.tableId) ? "yes" : "no";
  }
  if (isSchemaNode(node)) {
    if (selection.schemas.has(getSchemaId(node) ?? "")) {
      return "yes";
    }

    return areChildTablesSelected(node, selection.tables);
  }
  if (node.type === "database") {
    if (selection.databases.has(node.value.databaseId)) {
      return "yes";
    }
    return areChildSchemasSelected(node, selection);
  }

  return "no";
}

function areChildTablesSelected(
  node: TreeNode,
  selectedTables: Set<TableId>,
): "yes" | "no" | "some" {
  if (node.children.length === 0) {
    return "no";
  }

  const selectedTablesCount = node.children.filter(
    (child) =>
      child.type === "table" && selectedTables.has(child.value.tableId),
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

  const selectedSchemasResult = node.children.map((child) =>
    isItemSelected(child, selection),
  );

  return selectedSchemasResult.every((x) => x === "yes")
    ? "yes"
    : selectedSchemasResult.every((x) => x === "no")
      ? "no"
      : "some";
}

export function getSchemaId(item: FlatItem) {
  if (!isExpandedItem(item)) {
    return undefined;
  }
  if (!isTableNode(item)) {
    return undefined;
  }
  return `${item.value.databaseId}:${item.value.schemaName}`;
}

export function isParentSchemaSelected(
  item: FlatItem,
  selectedSchemas: Set<string>,
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
  selectedItems: Set<TableId>,
) {
  if (!schema) {
    return false;
  }

  const children = items.filter((child) => child.parent === schema.key);

  return !children.some(
    (child) =>
      child.type === "table" && selectedItems?.has(child.value?.tableId ?? ""),
  );
}

export function noManuallySelectedSchemas(
  database: { key: string },
  items: FlatItem[],
  selectedSchemas: Set<string>,
) {
  if (!database) {
    return false;
  }

  const children = items.filter((child) => child.parent === database.key);

  return !children.some(
    (child) =>
      child.type === "schema" && selectedSchemas.has(getSchemaId(child) ?? ""),
  );
}

export function noManuallySelectedDatabaseChildrenTables(
  database: DatabaseNode,
  selectedTables: Set<TableId>,
) {
  if (!database) {
    return false;
  }

  const answer = !database.children.some(
    (schema) =>
      schema.type === "schema" &&
      schema.children.some(
        (child) =>
          child.type === "table" && selectedTables.has(child.value.tableId),
      ),
  );

  return answer;
}

export function getParentSchema(tableItem: FlatItem, allItems: FlatItem[]) {
  return allItems.find((item) => {
    return (
      item.type === "schema" && getSchemaId(item) === getSchemaId(tableItem)
    );
  });
}

export function getSchemaTables(
  schema: FlatItem,
  allItems: ExpandedItem[] | TreeNode[],
) {
  const result = allItems
    .filter(
      (item) =>
        isTableNode(item) &&
        getSchemaId(schema) === getSchemaId(item) &&
        item.value.tableId,
    )
    .filter(isTableNode);

  return result;
}

export function getSchemaTableIds(schema: FlatItem, allItems: FlatItem[]) {
  const expandedItems = allItems.filter(isExpandedItem);
  return getSchemaTables(schema, expandedItems).map(
    (table) => table.value.tableId,
  );
}

export function getSchemaChildrenTableIds(schema: TreeNode) {
  return schema.children
    .filter((child) => child.type === "table")
    .map((child) => child.value.tableId);
}

export function getParentSchemaTables(item: FlatItem, allItems: FlatItem[]) {
  const parentSchema = getParentSchema(item, allItems);

  if (!parentSchema) {
    return [];
  }

  return allItems.filter((item) => {
    return (
      item.type === "table" && getSchemaId(parentSchema) === getSchemaId(item)
    );
  });
}

export function areTablesSelected(
  schema: FlatItem,
  allItems: TreeNode[],
  selectedItems: Set<TableId>,
): "all" | "some" | "none" {
  const tables = getSchemaTables(schema, allItems);
  if (tables.length === 0) {
    return "none";
  }
  if (tables.every((table) => selectedItems.has(table.value.tableId))) {
    return "all";
  }
  if (tables.some((table) => selectedItems.has(table.value.tableId))) {
    return "some";
  }
  return "none";
}

export function getSchemas(database: FlatItem, allItems: FlatItem[]) {
  return allItems.filter(
    (item) =>
      item.type === "schema" &&
      item.value &&
      item.value.databaseId === database.value?.databaseId,
  );
}

export function getChildSchemas(databaseNode: DatabaseNode) {
  return databaseNode.children.filter((x) => x.type === "schema");
}

export function areSchemasSelected(
  database: FlatItem,
  allItems: FlatItem[],
  selectedSchemas: Set<string>,
  selectedItems: Set<TableId>,
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
      (schema) =>
        selectedSchemas.has(getSchemaId(schema) ?? "") ||
        areTablesSelected(schema, schema.children, selectedItems) === "all",
    )
  ) {
    return "all";
  }

  if (
    schemas.some(
      (schema) =>
        selectedSchemas.has(getSchemaId(schema) ?? "") ||
        areTablesSelected(schema, schema.children, selectedItems) !== "none",
    )
  ) {
    return "some";
  }

  return "none";
}
