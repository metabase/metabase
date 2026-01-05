import type { SelectionState } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import type { DatabaseNode, SchemaNode, TreeNode } from "./types";
import { isSchemaNode, isTableNode } from "./types";

export interface NodeSelection {
  tables: Set<TableId>;
  schemas: Set<string>;
  databases: Set<DatabaseId>;
}

export function isItemSelected(
  node: TreeNode,
  selection: NodeSelection,
): SelectionState {
  if (isTableNode(node)) {
    return selection.tables.has(node.value.tableId) ? "all" : "none";
  }
  if (isSchemaNode(node)) {
    if (selection.schemas.has(getSchemaId(node))) {
      return "all";
    }

    return areChildTablesSelected(node, selection.tables);
  }
  if (node.type === "database") {
    if (selection.databases.has(node.value.databaseId)) {
      return "all";
    }
    return areChildSchemasSelected(node, selection);
  }

  return "none";
}

function areChildTablesSelected(
  node: TreeNode,
  selectedTables: Set<TableId>,
): SelectionState {
  if (node.children.length === 0) {
    return "none";
  }

  const selectedTablesCount = node.children.filter(
    (child) =>
      child.type === "table" && selectedTables.has(child.value.tableId),
  ).length;

  return selectedTablesCount === node.children.length
    ? "all"
    : selectedTablesCount > 0
      ? "some"
      : "none";
}

function areChildSchemasSelected(
  node: TreeNode,
  selection: NodeSelection,
): SelectionState {
  if (node.children.length === 0) {
    return "none";
  }

  const selectedSchemasResult = node.children.map((child) =>
    isItemSelected(child, selection),
  );

  return selectedSchemasResult.every((x) => x === "all")
    ? "all"
    : selectedSchemasResult.every((x) => x === "none")
      ? "none"
      : "some";
}

export function getSchemaId(item: SchemaNode): string {
  return `${item.value.databaseId}:${item.value.schemaName}`;
}

export function noManuallySelectedDatabaseChildrenTables(
  database: DatabaseNode,
  selectedTables: Set<TableId>,
): boolean {
  return !database.children.some(
    (schema) =>
      schema.type === "schema" &&
      schema.children.some(
        (child) =>
          child.type === "table" && selectedTables.has(child.value.tableId),
      ),
  );
}

export function getSchemaChildrenTableIds(schema: SchemaNode): TableId[] {
  return schema.children.map((child) => child.value.tableId);
}

export function markAllSchemas(
  database: DatabaseNode,
  targetChecked: "all" | "none",
  selection: NodeSelection,
): NodeSelection {
  const schemas = new Set(selection.schemas);
  const tables = new Set(selection.tables);

  for (const schema of database.children) {
    const schemaId = getSchemaId(schema);
    if (schema.children.length === 0) {
      targetChecked === "all"
        ? schemas.add(schemaId)
        : schemas.delete(schemaId);
    } else {
      markAllTables(schema, targetChecked, tables);
    }
  }

  return {
    tables,
    schemas,
    databases: selection.databases,
  };
}

function markAllTables(
  schema: SchemaNode,
  targetChecked: "all" | "none",
  tablesSelection: Set<TableId>,
) {
  for (const tableId of getSchemaChildrenTableIds(schema)) {
    targetChecked === "all"
      ? tablesSelection.add(tableId)
      : tablesSelection.delete(tableId);
  }
}

export function toggleDatabaseSelection(
  item: DatabaseNode,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const targetChecked = isSelected === "all" ? "none" : "all";

  return markAllSchemas(item, targetChecked, selection);
}

export function toggleSchemaSelection(
  item: SchemaNode,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const tables = new Set(selection.tables);

  if (isSelected === "all") {
    const tableIds = getSchemaChildrenTableIds(item);
    tableIds.forEach((x) => {
      tables.delete(x);
    });
  } else {
    const tableIds = getSchemaChildrenTableIds(item);
    tableIds.forEach((x) => {
      tables.add(x);
    });
  }

  return {
    tables,
    schemas: selection.schemas,
    databases: selection.databases,
  };
}
