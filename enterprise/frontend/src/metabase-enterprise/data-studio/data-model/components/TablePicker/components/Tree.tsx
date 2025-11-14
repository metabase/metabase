import { useEffect } from "react";
import { t } from "ttag";

import type { TableId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  type NodeSelection,
  getSchemaChildrenTableIds,
  getSchemaId,
  getSchemaTableIds,
  isItemSelected,
  noManuallySelectedDatabaseChildrenTables,
  noManuallySelectedSchemas,
  noManuallySelectedTables,
} from "../bulk-selection.utils";
import { useExpandedState, useTableLoader } from "../hooks";
import type {
  ChangeOptions,
  DatabaseNode,
  ExpandedItem,
  FlatItem,
  SchemaItem,
  SchemaNode,
  TreeNode,
  TreePath,
} from "../types";
import { isSchemaNode, isTableNode } from "../types";
import { flatten } from "../utils";

import { EmptyState } from "./EmptyState";
import { TablePickerResults } from "./Results";

interface Props {
  path: TreePath;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}

export function Tree({ path, onChange, setOnUpdateCallback }: Props) {
  const {
    selectedTables,
    setSelectedTables,
    selectedSchemas,
    setSelectedSchemas,
    selectedDatabases,
    setSelectedDatabases,
  } = useSelection();
  const { databaseId, schemaName } = path;
  const { isExpanded, toggle } = useExpandedState(path);
  const { tree, reload } = useTableLoader(path);

  useEffect(() => {
    setOnUpdateCallback(() => () => reload(path));
    return () => setOnUpdateCallback(null);
  }, [path, reload, setOnUpdateCallback]);

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
    selection: {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    },
  });

  useEffect(() => {
    const expandedDatabases = items.filter(
      (item) =>
        item.type === "database" &&
        item.isExpanded &&
        item.children.length === 0,
    );

    expandedDatabases.forEach((database) => {
      const databaseId = database.value?.databaseId;
      if (databaseId) {
        reload({ databaseId });
      }
    });
  }, [items, reload]);

  useEffect(() => {
    // Load tables when schemas are expanded
    const expandedSchemas = items.filter(
      (item) =>
        item.type === "schema" && item.isExpanded && item.children.length === 0,
    ) as SchemaItem[];

    expandedSchemas.forEach((schema) => {
      const { databaseId, schemaName } = schema.value ?? {};
      if (databaseId && schemaName) {
        reload({ databaseId, schemaName });
      }
    });
  }, [items, reload]);

  const isEmpty = items.length === 0;

  useEffect(() => {
    // When we detect only one database, we automatically select and expand it.
    const databases = tree.children.filter(
      (node) => (node as DatabaseNode).type === "database",
    ) as DatabaseNode[];

    if (databases.length !== 1) {
      return;
    }

    const [database] = databases;

    if (
      !isExpanded({ databaseId: database.value.databaseId }) &&
      databaseId == null
    ) {
      toggle(database.key, true);
      onChange(database.value, { isAutomatic: true });
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    // When we detect a database with just one schema, we automatically
    // select and expand that schema.
    const database = tree.children.find(
      (node) =>
        node.type === "database" && node.value.databaseId === databaseId,
    );
    if (
      databaseId &&
      isExpanded({ databaseId }) &&
      database?.children.length === 1 &&
      schemaName == null
    ) {
      const schema = database.children[0];
      if (schema.type === "schema") {
        toggle(schema.key, true);
        onChange(schema.value, { isAutomatic: true });
      }
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    const expandedSelectedSchemaItems = items.filter(
      (x) =>
        x.type === "schema" &&
        selectedSchemas.has(getSchemaId(x) ?? "") &&
        x.children.length > 0,
    );

    expandedSelectedSchemaItems.forEach((x) => {
      if (noManuallySelectedTables(x, items, selectedTables)) {
        // when expanding a schema, let's select all the tables in that schema
        const tableIds = getSchemaTableIds(x, items);
        if (tableIds.length === 0) {
          return;
        }

        setSelectedTables((prev) => {
          const newSet = new Set(prev);
          tableIds.forEach((x) => {
            newSet.add(x);
          });
          return newSet;
        });

        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          newSet.delete(getSchemaId(x) ?? "");
          return newSet;
        });
      }
    });
  }, [
    isExpanded,
    selectedSchemas,
    items,
    selectedTables,
    setSelectedTables,
    setSelectedSchemas,
  ]);

  useEffect(() => {
    const expandedSelectedDatabaseItems = items.filter(
      (x) =>
        x.type === "database" &&
        selectedDatabases.has(x.value?.databaseId ?? -1) &&
        x.children.length > 0,
    ) as unknown as DatabaseNode[];

    expandedSelectedDatabaseItems.forEach((x) => {
      if (
        noManuallySelectedSchemas(x, items, selectedSchemas) &&
        noManuallySelectedDatabaseChildrenTables(
          x as unknown as DatabaseNode,
          selectedTables,
        )
      ) {
        // single schema that's not rendered and it's not part of flattened list
        if (x.children.length === 1) {
          setSelectedTables((prev) => {
            const newSet = new Set(prev);
            x.children[0].children.forEach((y) => {
              newSet.add(y.value?.tableId ?? -1);
            });
            return newSet;
          });
        } else {
          // when expanding a db, let's select all the schemas in that db
          const schemaIds = (x as unknown as DatabaseNode).children.map((y) =>
            getSchemaId(y as unknown as FlatItem),
          );

          if (schemaIds.length === 0) {
            return;
          }

          setSelectedSchemas((prev) => {
            const newSet = new Set(prev);
            schemaIds.forEach((z) => {
              newSet.add(z ?? "");
            });
            return newSet;
          });
        }

        setSelectedDatabases((prev) => {
          const newSet = new Set(prev);
          newSet.delete((x as unknown as DatabaseNode).value?.databaseId ?? -1);
          return newSet;
        });
      }
    });
  }, [
    isExpanded,
    selectedDatabases,
    items,
    selectedSchemas,
    selectedTables,
    setSelectedDatabases,
    setSelectedTables,
    setSelectedSchemas,
  ]);

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  function onItemToggle(item: FlatItem) {
    const isSelected = isItemSelected(item as unknown as TreeNode, {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    });

    if (item.type === "table") {
      const tableId = item.value?.tableId ?? -1;
      if (tableId === -1) {
        return;
      }
      setSelectedTables((prev) => {
        const newSet = new Set(prev);
        isSelected === "yes" ? newSet.delete(tableId) : newSet.add(tableId);

        // Navigate to the table when checking/unchecking in multi-select mode
        // This keeps it active in the URL without expanding it
        if (item.value) {
          onChange(item.value);
        }

        return newSet;
      });
    }
    if (item.type === "database") {
      if (item.children.length > 0) {
        const targetChecked = isSelected === "yes" ? "no" : "yes";

        const { schemasSelection, tablesSelection, databasesSelection } =
          markAllSchemas(item, targetChecked, {
            tables: selectedTables,
            schemas: selectedSchemas,
            databases: selectedDatabases,
          });
        setSelectedSchemas(schemasSelection);
        setSelectedTables(tablesSelection);
        setSelectedDatabases(databasesSelection);
      } else {
        const databaseId = item.value?.databaseId;
        if (databaseId) {
          setSelectedDatabases((prev) => toggleInSet(prev, databaseId));
        }
      }
    }
    if (item.type === "schema" && item.isLoading === undefined) {
      if (item.children.length > 0 && isSchemaNode(item)) {
        if (isSelected === "yes") {
          setSelectedTables((prev) => {
            const tableIds = getSchemaChildrenTableIds(item);
            const newSet = new Set(prev);
            tableIds.forEach((x) => {
              newSet.delete(x);
            });
            return newSet;
          });
        } else {
          setSelectedTables((prev) => {
            const tableIds = getSchemaChildrenTableIds(item);
            const newSet = new Set(prev);
            tableIds.forEach((x) => {
              newSet.add(x);
            });
            return newSet;
          });
        }
      } else {
        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          const schemaId = getSchemaId(item);
          if (!schemaId) {
            return newSet;
          }
          if (schemaId && newSet.has(schemaId)) {
            newSet.delete(schemaId);
          } else {
            newSet.add(schemaId);
          }
          return newSet;
        });
      }
    }
  }

  function onItemRangeSelect(rangeItems: FlatItem[], targetItem: FlatItem) {
    const tableIds = rangeItems
      .filter(
        (rangeItem): rangeItem is ExpandedItem =>
          rangeItem.isLoading === undefined,
      )
      .filter(isTableNode)
      .map((rangeItem) =>
        rangeItem.value?.tableId ? rangeItem.value.tableId : null,
      )
      .filter((tableId): tableId is TableId => tableId != null);

    if (tableIds.length === 0) {
      return;
    }

    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      tableIds.forEach((tableId) => {
        newSet.add(tableId);
      });
      return newSet;
    });

    if (targetItem.type === "table" && targetItem.value) {
      onChange(targetItem.value);
    }
  }

  return (
    <TablePickerResults
      items={items}
      path={path}
      toggle={toggle}
      onItemClick={onChange}
      onItemToggle={onItemToggle}
      onRangeSelect={onItemRangeSelect}
    />
  );
}

function markAllSchemas(
  item: FlatItem,
  targetChecked: "yes" | "no",
  selection: NodeSelection,
) {
  const schemasSelection = new Set(selection.schemas);
  const tablesSelection = new Set(selection.tables);

  if (item.type !== "database") {
    return {
      schemasSelection,
      tablesSelection,
      databasesSelection: selection.databases,
    };
  }

  const schemas = item.children.filter(
    (child): child is SchemaNode => child.type === "schema",
  );
  schemas.forEach((schema) => {
    if (!isSchemaNode(schema)) {
      return;
    }
    const schemaId = getSchemaId(schema);
    if (!schemaId) {
      return;
    }
    if (schema.children.length === 0) {
      targetChecked === "yes"
        ? schemasSelection.add(schemaId)
        : schemasSelection.delete(schemaId);
    } else {
      markAllTables(schema, targetChecked, tablesSelection);
    }
  });

  return {
    schemasSelection,
    tablesSelection,
    databasesSelection: selection.databases,
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

  return tablesSelection;
}

function toggleInSet<T>(set: Set<T>, item: T) {
  const newSet = new Set(set);
  if (newSet.has(item)) {
    newSet.delete(item);
  } else {
    newSet.add(item);
  }
  return newSet;
}
