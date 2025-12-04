import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useDataModelApi } from "metabase-enterprise/data-studio/data-model/pages/DataModel/contexts/DataModelApiContext";
import type { TableId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  getSchemaId,
  getSchemaTableIds,
  isItemSelected,
  noManuallySelectedDatabaseChildrenTables,
  noManuallySelectedSchemas,
  noManuallySelectedTables,
  toggleDatabaseSelection,
  toggleSchemaSelection,
} from "../bulk-selection.utils";
import { useExpandedState, useTableLoader } from "../hooks";
import type {
  ChangeOptions,
  DatabaseNode,
  ExpandedItem,
  ExpandedSchemaItem,
  FlatItem,
  SchemaItem,
  TreeNode,
  TreePath,
} from "../types";
import {
  isDatabaseItem,
  isDatabaseNode,
  isSchemaItem,
  isSchemaNode,
  isTableNode,
  isTableOrSchemaNode,
} from "../types";
import { flatten } from "../utils";

import { EmptyState } from "./EmptyState";
import { TablePickerResults } from "./Results";

interface Props {
  path: TreePath;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function Tree({ path, onChange }: Props) {
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
  const { tree, reload } = useTableLoader();
  const { registerAction, unregisterAction } = useDataModelApi();

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

  /**
   * Initial loading all databases, schemas, tables for the current path
   */
  useEffect(() => {
    reload(path);
  }, [reload, path]);

  useEffect(() => {
    const expandedDatabases = items.filter(
      (item) =>
        isDatabaseItem(item) && item.isExpanded && item.children.length === 0,
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
    const databases = tree.children.filter((node) => isDatabaseNode(node));

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
      (node) => isDatabaseNode(node) && node.value.databaseId === databaseId,
    );
    if (
      databaseId &&
      isExpanded({ databaseId }) &&
      database?.children.length === 1 &&
      schemaName == null
    ) {
      const schema = database.children[0];
      if (isSchemaNode(schema)) {
        toggle(schema.key, true);
        onChange(schema.value, { isAutomatic: true });
      }
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    const expandedSelectedSchemaItems = items.filter(
      (item) =>
        isSchemaItem(item) &&
        selectedSchemas.has(getSchemaId(item) ?? "") &&
        item.children.length > 0,
    ) as ExpandedSchemaItem[];

    expandedSelectedSchemaItems.forEach((schemaItem) => {
      if (noManuallySelectedTables(schemaItem, items, selectedTables)) {
        // when expanding a schema, let's select all the tables in that schema
        const tableIds = getSchemaTableIds(schemaItem, items);
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

        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          newSet.delete(getSchemaId(schemaItem) ?? "");
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
      (item) =>
        isDatabaseItem(item) &&
        selectedDatabases.has(item.value?.databaseId ?? -1) &&
        item.children.length > 0,
    ) as DatabaseNode[];

    expandedSelectedDatabaseItems.forEach((dbNode) => {
      if (
        noManuallySelectedSchemas(dbNode, items, selectedSchemas) &&
        noManuallySelectedDatabaseChildrenTables(dbNode, selectedTables)
      ) {
        // single schema that's not rendered and it's not part of flattened list
        if (dbNode.children.length === 1) {
          setSelectedTables((prev) => {
            const newSet = new Set(prev);
            dbNode.children[0].children.forEach((y) => {
              newSet.add(y.value?.tableId ?? -1);
            });
            return newSet;
          });
        } else {
          // when expanding a db, let's select all the schemas in that db
          const schemaIds = dbNode.children.map((schemaNode) =>
            getSchemaId(schemaNode),
          );

          if (schemaIds.length === 0) {
            return;
          }

          setSelectedSchemas((prev) => {
            const newSet = new Set(prev);
            schemaIds.forEach((schemaId) => {
              newSet.add(schemaId ?? "");
            });
            return newSet;
          });
        }

        setSelectedDatabases((prev) => {
          const newSet = new Set(prev);
          newSet.delete(dbNode.value?.databaseId ?? -1);
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

  const refetchSelectedTables = useCallback(() => {
    const selectedTableNodes = items
      .filter((item) => isTableNode(item))
      .filter((tableNode) => selectedTables.has(tableNode.value.tableId));

    selectedTableNodes.forEach((tableNode) => reload(tableNode.value));
  }, [items, reload, selectedTables]);

  useEffect(() => {
    registerAction("refetchSelectedTables", refetchSelectedTables);
    return () => unregisterAction("refetchSelectedTables");
  }, [refetchSelectedTables, registerAction, unregisterAction]);

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  function onItemToggle(item: FlatItem) {
    const selection = {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    };
    const isSelected = isItemSelected(item as TreeNode, selection);

    if (isTableNode(item)) {
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
    if (isDatabaseItem(item)) {
      if (item.children.length > 0) {
        const { schemas, tables, databases } = toggleDatabaseSelection(
          item,
          selection,
        );
        setSelectedSchemas(schemas);
        setSelectedTables(tables);
        setSelectedDatabases(databases);
      } else {
        const databaseId = item.value?.databaseId;
        if (databaseId) {
          setSelectedDatabases((prev) => toggleInSet(prev, databaseId));
        }
      }
    }
    if (isSchemaItem(item)) {
      if (item.children.length > 0) {
        const { tables } = toggleSchemaSelection(item, selection);
        setSelectedTables(tables);
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
      .filter(isTableOrSchemaNode)
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

    if (isTableNode(targetItem) && targetItem.value) {
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

function toggleInSet<T>(set: Set<T>, item: T) {
  const newSet = new Set(set);
  if (newSet.has(item)) {
    newSet.delete(item);
  } else {
    newSet.add(item);
  }
  return newSet;
}
