import type { ExpandedState, OnChangeFn, Row } from "@tanstack/react-table";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import type { SelectionState, TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  EntityNameCell,
  Icon,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { UserId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  type NodeSelection,
  addDatabaseToSelection,
  addSchemaToSelection,
  addTableToSelection,
  cloneSelection,
  getSchemaId,
  isItemSelected,
  toggleDatabaseSelection,
  toggleInSet,
  toggleSchemaSelection,
} from "../bulk-selection.utils";
import { TYPE_ICONS } from "../constants";
import {
  type ChangeOptions,
  type RootNode,
  type TablePickerTreeNode,
  type TreeNode,
  type TreePath,
  isDatabaseNode,
  isSchemaNode,
  isTableNode,
} from "../types";
import {
  getTreeMap,
  nodeToTreePath,
  transformToTreeTableFormat,
} from "../utils";

const NUMBER_FORMAT_OPTIONS = { maximumFractionDigits: 0 };

interface Props {
  tree: RootNode;
  path: TreePath;
  isExpanded: (key: string) => boolean;
  onToggle: (key: string, value?: boolean) => void;
  onChange?: (path: TreePath, options?: ChangeOptions) => void;
  reload?: (path: TreePath) => void;
}

export function TablePickerTreeTable({
  tree,
  path,
  isExpanded,
  onToggle,
  onChange,
  reload,
}: Props) {
  const {
    selectedTables,
    setSelectedTables,
    selectedSchemas,
    setSelectedSchemas,
    selectedDatabases,
    setSelectedDatabases,
    selectedItemsCount,
  } = useSelection();

  const formatNumber = useNumberFormatter(NUMBER_FORMAT_OPTIONS);
  const lastSelectedRowIndex = useRef<number | null>(null);
  const instanceRef = useRef<ReturnType<
    typeof useTreeTableInstance<TablePickerTreeNode>
  > | null>(null);

  const { data: usersData } = useListUsersQuery();
  const ownerNameById = useMemo(() => {
    const users = usersData?.data ?? [];
    return new Map<UserId, string>(
      users.map((user) => [user.id, user.common_name]),
    );
  }, [usersData]);

  const treeData = useMemo(() => transformToTreeTableFormat(tree), [tree]);

  const nodeKeyToId = useMemo(() => {
    const map = new Map<string, string>();
    const traverse = (nodes: TablePickerTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.nodeKey, node.id);
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(treeData);
    return map;
  }, [treeData]);

  const nodeKeyToOriginal = useMemo(() => getTreeMap(tree), [tree]);

  const expandedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [key, id] of nodeKeyToId) {
      if (isExpanded(key)) {
        ids.add(id);
      }
    }
    return ids;
  }, [nodeKeyToId, isExpanded]);

  const selectionStateByKey = useMemo(() => {
    const map = new Map<string, SelectionState>();
    const selection: NodeSelection = {
      tables: selectedTables,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    };

    for (const [key, originalNode] of nodeKeyToOriginal) {
      map.set(key, isItemSelected(originalNode, selection));
    }
    return map;
  }, [nodeKeyToOriginal, selectedTables, selectedSchemas, selectedDatabases]);

  const handleExpandedChange = useCallback(
    (newExpandedIds: Set<string>) => {
      for (const [key, id] of nodeKeyToId) {
        const wasExpanded = isExpanded(key);
        const isNowExpanded = newExpandedIds.has(id);

        if (wasExpanded && !isNowExpanded) {
          onToggle(key, false);
        } else if (!wasExpanded && isNowExpanded) {
          onToggle(key, true);
        }
      }
    },
    [nodeKeyToId, isExpanded, onToggle],
  );

  const getSelectionState = useCallback(
    (row: Row<TablePickerTreeNode>): SelectionState => {
      return selectionStateByKey.get(row.original.nodeKey) ?? "none";
    },
    [selectionStateByKey],
  );

  const handleCheckboxToggle = useCallback(
    (row: Row<TablePickerTreeNode>, index: number, isShiftPressed: boolean) => {
      const selection: NodeSelection = {
        tables: selectedTables,
        schemas: selectedSchemas,
        databases: selectedDatabases,
      };

      const result = changeCheckboxSelection({
        row,
        index,
        isShiftPressed,
        selection,
        lastSelectedRowIndex: lastSelectedRowIndex.current,
        rows: instanceRef.current?.rows ?? [],
        nodeKeyToOriginal,
      });

      setSelectedTables(result.selection.tables);
      setSelectedSchemas(result.selection.schemas);
      setSelectedDatabases(result.selection.databases);
      lastSelectedRowIndex.current = result.lastSelectedRowIndex;

      if (row.original.type === "table" && row.original.tableId != null) {
        onChange?.(nodeToTreePath(row.original));
      }
    },
    [
      nodeKeyToOriginal,
      selectedTables,
      selectedSchemas,
      selectedDatabases,
      setSelectedTables,
      setSelectedSchemas,
      setSelectedDatabases,
      onChange,
    ],
  );

  const handleCheckboxClick = useCallback(
    (row: Row<TablePickerTreeNode>, index: number, event: MouseEvent) => {
      handleCheckboxToggle(row, index, event.shiftKey);
    },
    [handleCheckboxToggle],
  );

  const columns: TreeTableColumnDef<TablePickerTreeNode>[] = useMemo(
    () => [
      {
        id: "name",
        header: t`Name`,
        cell: ({ row }) => (
          <EntityNameCell
            icon={TYPE_ICONS[row.original.type]}
            name={row.original.name}
          />
        ),
      },
      {
        id: "owner",
        header: t`Owner`,
        width: 140,
        cell: ({ row }) => {
          if (row.original.type !== "table" || !row.original.table) {
            return null;
          }
          const ownerId = row.original.table.owner_user_id;
          const ownerName =
            ownerId != null && ownerNameById.has(ownerId)
              ? ownerNameById.get(ownerId)
              : (row.original.table.owner_email ?? null);
          return ownerName ? (
            <Box data-testid="table-owner">{ownerName}</Box>
          ) : null;
        },
      },
      {
        id: "rows",
        header: t`Rows`,
        width: "auto",
        cell: ({ row }) => {
          if (row.original.type !== "table" || !row.original.table) {
            return null;
          }
          const rowCount = row.original.table.estimated_row_count;
          return rowCount != null ? (
            <Box w="100%" ta="right" data-testid="table-expected-rows">
              {formatNumber(rowCount)}
            </Box>
          ) : null;
        },
      },
      {
        id: "published",
        header: t`Published`,
        width: "auto",
        cell: ({ row }) => {
          if (row.original.type !== "table" || !row.original.table) {
            return null;
          }
          return row.original.table.is_published ? (
            <Box w="100%" ta="center" data-testid="table-published">
              <Icon
                name="verified_round"
                c="success"
                aria-label={t`Published`}
              />
            </Box>
          ) : null;
        },
      },
    ],
    [ownerNameById, formatNumber],
  );

  const expandedState = useMemo(
    () => Object.fromEntries([...expandedIds].map((id) => [id, true])),
    [expandedIds],
  );

  const handleExpandedStateChange: OnChangeFn<ExpandedState> = useCallback(
    (updater) => {
      const newState =
        typeof updater === "function" ? updater(expandedState) : updater;

      if (typeof newState === "boolean") {
        return;
      }

      const newIds = new Set(
        Object.entries(newState)
          .filter(([, expanded]) => expanded)
          .map(([id]) => id),
      );
      handleExpandedChange(newIds);
    },
    [expandedState, handleExpandedChange],
  );

  const selectedRowId = useMemo(() => {
    if (selectedItemsCount > 0) {
      return null;
    }
    if (path.tableId != null) {
      return `table:${path.tableId}`;
    }
    if (path.schemaName != null && path.databaseId != null) {
      return `schema:${path.databaseId}:${path.schemaName}`;
    }
    if (path.databaseId != null) {
      return `db:${path.databaseId}`;
    }
    return null;
  }, [path, selectedItemsCount]);

  const handleRowActivate = useCallback(
    (row: Row<TablePickerTreeNode>) => {
      if (!row.original.isDisabled) {
        onChange?.(nodeToTreePath(row.original));
      }
    },
    [onChange],
  );

  const instance = useTreeTableInstance({
    data: treeData,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    getRowCanExpand: (row) => row.original.type !== "table",
    expanded: expandedState,
    onExpandedChange: handleExpandedStateChange,
    enableRowSelection: false,
    selectedRowId,
    onRowActivate: handleRowActivate,
  });

  instanceRef.current = instance;

  useEffect(() => {
    if (selectedItemsCount === 0) {
      lastSelectedRowIndex.current = null;
    }
  }, [selectedItemsCount]);

  useEffect(() => {
    if (!reload) {
      return;
    }
    for (const row of instance.rows) {
      if (
        row.getIsExpanded() &&
        row.getCanExpand() &&
        row.original.children?.length === 0
      ) {
        const nodePath = nodeToTreePath(row.original);
        reload(nodePath);
      }
    }
  }, [instance.rows, reload]);

  const handleRowClick = useCallback(
    (row: Row<TablePickerTreeNode>) => {
      if (row.original.isDisabled) {
        return;
      }

      const isActive = isNodeActive(row.original, path);
      const hasChildren = row.original.type !== "table";

      if (selectedItemsCount > 0) {
        if (hasChildren) {
          onToggle(row.original.nodeKey);
        }
        return;
      }

      if (hasChildren) {
        if (isActive) {
          onToggle(row.original.nodeKey);
        } else {
          if (!row.getIsExpanded()) {
            onToggle(row.original.nodeKey, true);
          }
          onChange?.(nodeToTreePath(row.original));
        }
      } else {
        onChange?.(nodeToTreePath(row.original));
      }
    },
    [path, selectedItemsCount, onToggle, onChange],
  );

  const getRowProps = useCallback(
    (row: Row<TablePickerTreeNode>) => ({
      "data-testid": "tree-item",
      "data-type": row.original.type,
      ...(row.original.databaseId != null && {
        "data-database-id": row.original.databaseId,
      }),
      ...(row.original.schemaName != null && {
        "data-schema-name": row.original.schemaName,
      }),
      ...(row.original.tableId != null && {
        "data-table-id": row.original.tableId,
      }),
    }),
    [],
  );

  return (
    <TreeTable
      instance={instance}
      showCheckboxes
      onRowClick={handleRowClick}
      getSelectionState={getSelectionState}
      onCheckboxClick={handleCheckboxClick}
      isChildrenLoading={isChildrenLoading}
      isRowDisabled={isRowDisabled}
      getRowProps={getRowProps}
      ariaLabel={t`Tables`}
    />
  );
}

export interface CheckboxToggleResult {
  selection: NodeSelection;
  lastSelectedRowIndex: number;
}

export function changeCheckboxSelection(params: {
  row: Row<TablePickerTreeNode>;
  index: number;
  isShiftPressed: boolean;
  selection: NodeSelection;
  lastSelectedRowIndex: number | null;
  rows: Row<TablePickerTreeNode>[];
  nodeKeyToOriginal: Map<string, TreeNode>;
}): CheckboxToggleResult {
  const {
    row,
    index,
    isShiftPressed,
    selection,
    lastSelectedRowIndex,
    rows,
    nodeKeyToOriginal,
  } = params;

  if (isShiftPressed && lastSelectedRowIndex != null) {
    return handleRangeCheckboxSelection({
      startIndex: Math.min(lastSelectedRowIndex, index),
      endIndex: Math.max(lastSelectedRowIndex, index),
      currentIndex: index,
      rows,
      nodeKeyToOriginal,
      baseSelection: selection,
    });
  }

  return handleSingleCheckboxSelection({
    row,
    index,
    selection,
    nodeKeyToOriginal,
  });
}

function handleRangeCheckboxSelection(params: {
  startIndex: number;
  endIndex: number;
  currentIndex: number;
  rows: Row<TablePickerTreeNode>[];
  nodeKeyToOriginal: Map<string, TreeNode>;
  baseSelection: NodeSelection;
}): CheckboxToggleResult {
  const {
    startIndex,
    endIndex,
    currentIndex,
    rows,
    nodeKeyToOriginal,
    baseSelection,
  } = params;

  const rangeRows = rows
    .slice(startIndex, endIndex + 1)
    .filter((r) => !r.original.isDisabled);

  // Skip a parent if its next item is its child (deeper in the tree).
  // This allows partial selection within expanded parents.
  const indexesToSkip = rangeRows.reduce<number[]>((memo, row, i, arr) => {
    const nextRow = arr[i + 1];
    if (nextRow?.depth > row.depth) {
      memo.push(i);
    }
    return memo;
  }, []);

  const nextSelection: NodeSelection = rangeRows
    .entries()
    .reduce((memo, [rowIndex, rangeRow]) => {
      const originalNode = nodeKeyToOriginal.get(rangeRow.original.nodeKey);
      if (indexesToSkip.includes(rowIndex) || !originalNode) {
        return memo;
      }
      return match(originalNode)
        .when(isTableNode, (treeNode) => addTableToSelection(treeNode, memo))
        .when(isSchemaNode, (schemaNode) =>
          addSchemaToSelection(schemaNode, memo),
        )
        .when(isDatabaseNode, (databaseNode) =>
          addDatabaseToSelection(databaseNode, memo),
        )
        .otherwise(() => memo);
    }, cloneSelection(baseSelection));

  return {
    selection: nextSelection,
    lastSelectedRowIndex: currentIndex,
  };
}

function handleSingleCheckboxSelection(params: {
  row: Row<TablePickerTreeNode>;
  index: number;
  selection: NodeSelection;
  nodeKeyToOriginal: Map<string, TreeNode>;
}): CheckboxToggleResult {
  const { row, index, selection, nodeKeyToOriginal } = params;

  if (row.original.type === "table") {
    const tableId = row.original.tableId;
    if (tableId == null) {
      return { selection, lastSelectedRowIndex: index };
    }
    return {
      selection: {
        ...selection,
        tables: toggleInSet(selection.tables, tableId),
      },
      lastSelectedRowIndex: index,
    };
  }

  if (row.original.type === "database") {
    const originalNode = nodeKeyToOriginal.get(row.original.nodeKey);
    if (!originalNode || originalNode.type !== "database") {
      return { selection, lastSelectedRowIndex: index };
    }

    if (originalNode.children.length > 0) {
      return {
        selection: toggleDatabaseSelection(originalNode, selection),
        lastSelectedRowIndex: index,
      };
    }

    const databaseId = row.original.databaseId;
    if (databaseId) {
      return {
        selection: {
          ...selection,
          databases: toggleInSet(selection.databases, databaseId),
        },
        lastSelectedRowIndex: index,
      };
    }
  }

  if (row.original.type === "schema") {
    const originalNode = nodeKeyToOriginal.get(row.original.nodeKey);
    if (!originalNode || originalNode.type !== "schema") {
      return { selection, lastSelectedRowIndex: index };
    }

    if (originalNode.children.length > 0) {
      return {
        selection: toggleSchemaSelection(originalNode, selection),
        lastSelectedRowIndex: index,
      };
    }

    const schemaId = getSchemaId(originalNode);
    return {
      selection: {
        ...selection,
        schemas: toggleInSet(selection.schemas, schemaId),
      },
      lastSelectedRowIndex: index,
    };
  }

  return { selection, lastSelectedRowIndex: index };
}

function isChildrenLoading(row: Row<TablePickerTreeNode>): boolean {
  return (
    row.getIsExpanded() &&
    row.getCanExpand() &&
    row.original.children?.length === 0
  );
}

function isRowDisabled(row: Row<TablePickerTreeNode>): boolean {
  return Boolean(row.original.isDisabled);
}

function isNodeActive(node: TablePickerTreeNode, path: TreePath): boolean {
  if (node.type === "database") {
    return (
      node.databaseId === path.databaseId &&
      path.tableId == null &&
      path.schemaName == null
    );
  }

  if (node.type === "schema") {
    return (
      node.databaseId === path.databaseId &&
      node.schemaName === path.schemaName &&
      path.tableId == null
    );
  }

  if (node.type === "table") {
    return node.tableId === path.tableId;
  }

  return false;
}
