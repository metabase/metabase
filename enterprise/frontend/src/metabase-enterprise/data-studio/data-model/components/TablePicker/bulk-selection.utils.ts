import type { DatabaseId, TableId } from "metabase-types/api";

import type { DatabaseNode, SchemaNode, TreeNode } from "./types";
import { isSchemaNode, isTableNode } from "./types";

export interface NodeSelection {
  tables: Set<TableId>;
  schemas: Set<string>;
  databases: Set<DatabaseId>;
}

type NodeSelectionValues = "yes" | "no" | "some";

export function isItemSelected(
  node: TreeNode,
  selection: NodeSelection,
): NodeSelectionValues {
  if (isTableNode(node)) {
    return selection.tables.has(node.value.tableId) ? "yes" : "no";
  }
  if (isSchemaNode(node)) {
    if (selection.schemas.has(getSchemaId(node))) {
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
): NodeSelectionValues {
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
): NodeSelectionValues {
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
  targetChecked: "yes" | "no",
  selection: NodeSelection,
): NodeSelection {
  const schemas = new Set(selection.schemas);
  const tables = new Set(selection.tables);

  for (const schema of database.children) {
    const schemaId = getSchemaId(schema);
    if (schema.children.length === 0) {
      targetChecked === "yes"
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
  targetChecked: "yes" | "no",
  tablesSelection: Set<TableId>,
) {
  for (const tableId of getSchemaChildrenTableIds(schema)) {
    targetChecked === "yes"
      ? tablesSelection.add(tableId)
      : tablesSelection.delete(tableId);
  }
}

export function toggleDatabaseSelection(
  item: DatabaseNode,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const targetChecked = isSelected === "yes" ? "no" : "yes";

  return markAllSchemas(item, targetChecked, selection);
}

export function toggleSchemaSelection(
  item: SchemaNode,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const tables = new Set(selection.tables);

  if (isSelected === "yes") {
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
