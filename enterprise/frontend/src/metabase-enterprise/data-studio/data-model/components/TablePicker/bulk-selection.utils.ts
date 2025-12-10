import type { DatabaseId, TableId } from "metabase-types/api";

import type {
  DatabaseNode,
  ExpandedDatabaseItem,
  ExpandedItem,
  ExpandedSchemaItem,
  FlatItem,
  SchemaNode,
  TreeNode,
} from "./types";
import {
  isExpandedItem,
  isSchemaNode,
  isTableNode,
  isTableOrSchemaNode,
} from "./types";

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

export function getSchemaId(item: FlatItem | SchemaNode) {
  if (
    "value" in item &&
    item.value &&
    "databaseId" in item.value &&
    "schemaName" in item.value
  ) {
    return `${item.value.databaseId}:${item.value.schemaName}`;
  }
}

export function isParentSchemaSelected(
  item: FlatItem,
  selectedSchemas: Set<string>,
) {
  if (!isTableNode(item)) {
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
        isTableOrSchemaNode(item) &&
        getSchemaId(schema) === getSchemaId(item) &&
        item.value.tableId,
    )
    .filter(isTableOrSchemaNode);

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

export function markAllSchemas(
  item: FlatItem,
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
  item: ExpandedDatabaseItem,
  selection: NodeSelection,
): NodeSelection {
  const isSelected = isItemSelected(item, selection);
  const targetChecked = isSelected === "yes" ? "no" : "yes";

  return markAllSchemas(item, targetChecked, selection);
}

export function toggleSchemaSelection(
  item: ExpandedSchemaItem,
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
