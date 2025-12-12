import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import type { TableId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  getSchemaId,
  getSchemaTableIds,
  noManuallySelectedDatabaseChildrenTables,
  noManuallySelectedSchemas,
  noManuallySelectedTables,
} from "../bulk-selection.utils";
import { useExpandedState, useTableLoader } from "../hooks";
import type {
  ChangeOptions,
  DatabaseNode,
  ExpandedSchemaItem,
  RootNode,
  SchemaItem,
  TreePath,
} from "../types";
import {
  isDatabaseItem,
  isDatabaseNode,
  isSchemaItem,
  isSchemaNode,
  isTableNode,
} from "../types";
import { flatten } from "../utils";

import { EmptyState } from "./EmptyState";
import { TablePickerTreeTable } from "./TablePickerTreeTable";

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
  const { tree, reload } = useTableLoader();

  const items = useMemo(
    () =>
      flatten(tree, {
        isExpanded,
        addLoadingNodes: true,
        canFlattenSingleSchema: true,
        selection: {
          tables: selectedTables,
          schemas: selectedSchemas,
          databases: selectedDatabases,
        },
      }),
    [tree, isExpanded, selectedTables, selectedSchemas, selectedDatabases],
  );

  useEffect(() => {
    reload(path);
  }, [reload, path]);

  const refetchSelectedTables = useCallback(() => {
    const selectedTableNodes = items
      .filter((item) => isTableNode(item))
      .filter((tableNode) => {
        const tableId = tableNode.value?.tableId;
        return tableId != null && selectedTables.has(tableId as TableId);
      });

    selectedTableNodes.forEach((tableNode) => {
      if (tableNode.value) {
        reload(tableNode.value);
      }
    });
  }, [items, reload, selectedTables]);

  useEffect(() => {
    setOnUpdateCallback(() => refetchSelectedTables);
    return () => setOnUpdateCallback(null);
  }, [refetchSelectedTables, setOnUpdateCallback]);

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
        if (dbNode.children.length === 1) {
          setSelectedTables((prev) => {
            const newSet = new Set(prev);
            dbNode.children[0].children.forEach((y) => {
              newSet.add(y.value?.tableId ?? -1);
            });
            return newSet;
          });
        } else {
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

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  return (
    <TablePickerTreeTable
      tree={tree as RootNode}
      path={path}
      isExpanded={isExpanded}
      onToggle={toggle}
      onChange={onChange}
      reload={reload}
    />
  );
}
