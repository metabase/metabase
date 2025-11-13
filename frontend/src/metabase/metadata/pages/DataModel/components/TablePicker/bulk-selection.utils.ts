import type { DatabaseId, TableId } from "metabase-types/api";

import type { DatabaseNode, FlatItem, TreeNode } from "./types";

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
  database: { key: string },
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
