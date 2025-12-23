import type { DatabaseId, TableId } from "metabase-types/api";

import type {
  DatabaseNode,
  ExpandedDatabaseItem,
  ExpandedSchemaItem,
  SchemaNode,
  TreeNode,
} from "./types";
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
  if (!selection) {
    return "no";
  }
  if (isTableNode(node)) {
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

export function getSchemaId(
  item:
    | SchemaNode
    | { value?: { databaseId?: DatabaseId; schemaName?: string } },
) {
  if (
    "value" in item &&
    item.value &&
    "databaseId" in item.value &&
    "schemaName" in item.value
  ) {
    return `${item.value.databaseId}:${item.value.schemaName}`;
  }
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

export function getSchemaChildrenTableIds(schema: TreeNode) {
  return schema.children
    .filter((child) => child.type === "table")
    .map((child) => child.value.tableId);
}

export function markAllSchemas(
  item: DatabaseNode,
  targetChecked: "yes" | "no",
  selection: NodeSelection,
): NodeSelection {
  const schemas = new Set(selection.schemas);
  const tables = new Set(selection.tables);

  if (item.type !== "database") {
    return {
      tables,
      schemas,
      databases: selection.databases,
    };
  }

  const filteredSchemas = item.children.filter(
    (child): child is SchemaNode => child.type === "schema",
  );
  filteredSchemas.forEach((schema) => {
    if (!isSchemaNode(schema)) {
      return;
    }
    const schemaId = getSchemaId(schema);
    if (!schemaId) {
      return;
    }
    if (schema.children.length === 0) {
      targetChecked === "yes"
        ? schemas.add(schemaId)
        : schemas.delete(schemaId);
    } else {
      markAllTables(schema, targetChecked, tables);
    }
  });

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
  const tables = getSchemaChildrenTableIds(schema);
  tables.forEach((tableId) => {
    if (tableId === -1) {
      return;
    }
    targetChecked === "yes"
      ? tablesSelection.add(tableId)
      : tablesSelection.delete(tableId);
  });
}

export function toggleDatabaseSelection(
  item: ExpandedDatabaseItem | DatabaseNode,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const targetChecked = isSelected === "yes" ? "no" : "yes";

  return markAllSchemas(item, targetChecked, selection);
}

export function toggleSchemaSelection(
  item: ExpandedSchemaItem | SchemaNode,
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
