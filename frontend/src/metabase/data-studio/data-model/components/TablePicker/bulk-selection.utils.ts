import type { SelectionState } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import type { DatabaseNode, SchemaNode, TableNode, TreeNode } from "./types";
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
      if (targetChecked === "all") {
        schemas.add(schemaId);
      } else {
        schemas.delete(schemaId);
      }
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
    if (targetChecked === "all") {
      tablesSelection.add(tableId);
    } else {
      tablesSelection.delete(tableId);
    }
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

export function toggleInSet<T>(set: Set<T>, item: T): Set<T> {
  const newSet = new Set(set);
  if (newSet.has(item)) {
    newSet.delete(item);
  } else {
    newSet.add(item);
  }
  return newSet;
}

export const cloneSelection = (selection: NodeSelection): NodeSelection => ({
  tables: new Set(selection.tables),
  databases: new Set(selection.databases),
  schemas: new Set(selection.schemas),
});

export function addTableToSelection(
  table: TableNode,
  selection: NodeSelection,
): NodeSelection {
  const nextSelection = cloneSelection(selection);
  nextSelection.tables.add(table.value.tableId);
  return nextSelection;
}

export function addSchemaToSelection(
  schema: SchemaNode,
  selection: NodeSelection,
): NodeSelection {
  const nextSelection = cloneSelection(selection);
  if (schema.children.length > 0) {
    return schema.children.reduce(
      (memo, tableNode) => addTableToSelection(tableNode, memo),
      nextSelection,
    );
  }
  nextSelection.schemas.add(getSchemaId(schema));
  return nextSelection;
}

export function addDatabaseToSelection(
  database: DatabaseNode,
  selection: NodeSelection,
): NodeSelection {
  const nextSelection = cloneSelection(selection);
  if (database.children.length > 0) {
    return database.children.reduce(
      (memo, schema) => addSchemaToSelection(schema, memo),
      nextSelection,
    );
  }
  nextSelection.databases.add(database.value.databaseId);
  return nextSelection;
}
