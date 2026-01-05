import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { TreeTableSkeleton } from "metabase/ui";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  getSchemaId,
  noManuallySelectedDatabaseChildrenTables,
} from "../bulk-selection.utils";
import { useExpandedState, useTableLoader } from "../hooks";
import type { ChangeOptions, TreePath } from "../types";
import {
  findSelectedTableNodes,
  getExpandedSelectedDatabases,
  getExpandedSelectedSchemas,
  hasManuallySelectedSchemas,
  hasManuallySelectedTables,
} from "../utils";

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
  const { tree, reload, isLoading } = useTableLoader();

  useEffect(() => {
    reload(path);
  }, [reload, path]);

  const refetchSelectedTables = useCallback(() => {
    const selectedTableNodes = findSelectedTableNodes(tree, selectedTables);
    selectedTableNodes.forEach((tableNode) => {
      reload(tableNode.value);
    });
  }, [tree, reload, selectedTables]);

  useEffect(() => {
    setOnUpdateCallback(() => refetchSelectedTables);
    return () => setOnUpdateCallback(null);
  }, [refetchSelectedTables, setOnUpdateCallback]);

  useEffect(() => {
    if (tree.children.length !== 1) {
      return;
    }

    const [database] = tree.children;

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
      (node) => node.value.databaseId === databaseId,
    );
    if (
      databaseId &&
      isExpanded({ databaseId }) &&
      database?.children.length === 1 &&
      schemaName == null
    ) {
      const schema = database.children[0];
      toggle(schema.key, true);
      onChange(schema.value, { isAutomatic: true });
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    const expandedSelectedSchemas = getExpandedSelectedSchemas(
      tree,
      selectedSchemas,
      isExpanded,
    );

    expandedSelectedSchemas.forEach((schema) => {
      if (!hasManuallySelectedTables(schema, selectedTables)) {
        const tableIds = schema.children.map((table) => table.value.tableId);
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
          newSet.delete(getSchemaId(schema));
          return newSet;
        });
      }
    });
  }, [
    tree,
    isExpanded,
    selectedSchemas,
    selectedTables,
    setSelectedTables,
    setSelectedSchemas,
  ]);

  useEffect(() => {
    const expandedSelectedDatabases = getExpandedSelectedDatabases(
      tree,
      selectedDatabases,
      isExpanded,
    );

    expandedSelectedDatabases.forEach((dbNode) => {
      if (
        !hasManuallySelectedSchemas(dbNode, selectedSchemas) &&
        noManuallySelectedDatabaseChildrenTables(dbNode, selectedTables)
      ) {
        if (dbNode.children.length === 1) {
          setSelectedTables((prev) => {
            const newSet = new Set(prev);
            dbNode.children[0].children.forEach((table) => {
              newSet.add(table.value.tableId);
            });
            return newSet;
          });
        } else if (dbNode.children.length > 0) {
          setSelectedSchemas((prev) => {
            const newSet = new Set(prev);
            for (const schema of dbNode.children) {
              newSet.add(getSchemaId(schema));
            }
            return newSet;
          });
        }

        setSelectedDatabases((prev) => {
          const newSet = new Set(prev);
          newSet.delete(dbNode.value.databaseId);
          return newSet;
        });
      }
    });
  }, [
    tree,
    isExpanded,
    selectedDatabases,
    selectedSchemas,
    selectedTables,
    setSelectedDatabases,
    setSelectedTables,
    setSelectedSchemas,
  ]);

  if (isLoading) {
    return (
      <TreeTableSkeleton showCheckboxes columnWidths={[0.5, 0.15, 0.1, 0.1]} />
    );
  }

  if (tree.children.length === 0) {
    return <EmptyState title={t`No data to show`} />;
  }

  return (
    <TablePickerTreeTable
      tree={tree}
      path={path}
      isExpanded={isExpanded}
      onToggle={toggle}
      onChange={onChange}
      reload={reload}
    />
  );
}
