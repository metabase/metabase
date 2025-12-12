import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import type { FlatTreeNode, NodeId, TreeColumnDef } from "metabase/ui";
import { Group, Icon, TreeTable, useTreeTable } from "metabase/ui";
import type { TableId, UserId } from "metabase-types/api";

import { useSelection } from "../../../pages/DataModel/contexts/SelectionContext";
import {
  type NodeSelection,
  getSchemaId,
  isItemSelected,
  toggleDatabaseSelection,
  toggleSchemaSelection,
} from "../bulk-selection.utils";
import { TYPE_ICONS } from "../constants";
import type {
  ChangeOptions,
  RootNode,
  TablePickerTreeNode,
  TreePath,
} from "../types";
import { nodeToTreePath, transformToTreeTableFormat } from "../utils";

interface Props {
  tree: RootNode;
  path: TreePath;
  isExpanded: (key: string) => boolean;
  onToggle: (key: string, value?: boolean) => void;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
  reload: (path: TreePath) => void;
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

  const formatNumber = useNumberFormatter({ maximumFractionDigits: 0 });
  const lastSelectedTableIndex = useRef<number | null>(null);
  const instanceRef = useRef<ReturnType<
    typeof useTreeTable<TablePickerTreeNode>
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
    const map = new Map<string, NodeId>();
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

  const expandedIds = useMemo(() => {
    const ids = new Set<NodeId>();
    for (const [key, id] of nodeKeyToId) {
      if (isExpanded(key)) {
        ids.add(id);
      }
    }
    return ids;
  }, [nodeKeyToId, isExpanded]);

  const handleExpandedChange = useCallback(
    (newExpandedIds: Set<NodeId>) => {
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
    (node: FlatTreeNode<TablePickerTreeNode>): "all" | "some" | "none" => {
      const selection: NodeSelection = {
        tables: selectedTables,
        schemas: selectedSchemas,
        databases: selectedDatabases,
      };

      const originalNode = findOriginalNode(tree, node.data);
      if (!originalNode) {
        return "none";
      }

      const result = isItemSelected(originalNode, selection);
      if (result === "yes") {
        return "all";
      }
      if (result === "some") {
        return "some";
      }
      return "none";
    },
    [tree, selectedTables, selectedSchemas, selectedDatabases],
  );

  const handleCheckboxToggle = useCallback(
    (
      node: FlatTreeNode<TablePickerTreeNode>,
      index: number,
      isShiftPressed: boolean,
    ) => {
      const selection: NodeSelection = {
        tables: selectedTables,
        schemas: selectedSchemas,
        databases: selectedDatabases,
      };

      const isTable = node.data.type === "table";
      const hasRangeAnchor = lastSelectedTableIndex.current != null;
      const isRangeSelection = isShiftPressed && isTable && hasRangeAnchor;

      if (isRangeSelection && lastSelectedTableIndex.current != null) {
        const flatNodes = instanceRef.current?.flatNodes ?? [];
        const start = Math.min(lastSelectedTableIndex.current, index);
        const end = Math.max(lastSelectedTableIndex.current, index);
        const rangeNodes = flatNodes
          .slice(start, end + 1)
          .filter((n) => !n.isDisabled && n.data.type === "table");

        const tableIds = rangeNodes
          .map((n) => n.data.tableId)
          .filter((id): id is TableId => id != null);

        if (tableIds.length > 0) {
          setSelectedTables((prev) => {
            const newSet = new Set(prev);
            tableIds.forEach((id) => newSet.add(id));
            return newSet;
          });
          lastSelectedTableIndex.current = index;

          if (node.data.tableId != null) {
            onChange(nodeToTreePath(node.data));
          }
          return;
        }
      }

      if (node.data.type === "table") {
        const tableId = node.data.tableId;
        if (tableId == null) {
          return;
        }

        const isSelected = selectedTables.has(tableId);
        setSelectedTables((prev) => {
          const newSet = new Set(prev);
          isSelected ? newSet.delete(tableId) : newSet.add(tableId);
          return newSet;
        });
        lastSelectedTableIndex.current = index;

        onChange(nodeToTreePath(node.data));
      } else if (node.data.type === "database") {
        const originalNode = findOriginalNode(tree, node.data);
        if (!originalNode || originalNode.type !== "database") {
          return;
        }

        if (originalNode.children.length > 0) {
          const { schemas, tables, databases } = toggleDatabaseSelection(
            { ...originalNode, level: 0 } as any,
            selection,
          );
          setSelectedSchemas(schemas);
          setSelectedTables(tables);
          setSelectedDatabases(databases);
        } else {
          const databaseId = node.data.databaseId;
          if (databaseId) {
            setSelectedDatabases((prev) => {
              const newSet = new Set(prev);
              newSet.has(databaseId)
                ? newSet.delete(databaseId)
                : newSet.add(databaseId);
              return newSet;
            });
          }
        }
      } else if (node.data.type === "schema") {
        const originalNode = findOriginalNode(tree, node.data);
        if (!originalNode || originalNode.type !== "schema") {
          return;
        }

        if (originalNode.children.length > 0) {
          const { tables } = toggleSchemaSelection(
            { ...originalNode, level: 0 } as any,
            selection,
          );
          setSelectedTables(tables);
        } else {
          const schemaId = getSchemaId(originalNode);
          if (schemaId) {
            setSelectedSchemas((prev) => {
              const newSet = new Set(prev);
              newSet.has(schemaId)
                ? newSet.delete(schemaId)
                : newSet.add(schemaId);
              return newSet;
            });
          }
        }
      }
    },
    [
      tree,
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
    (
      node: FlatTreeNode<TablePickerTreeNode>,
      index: number,
      event: MouseEvent,
    ) => {
      handleCheckboxToggle(node, index, event.shiftKey);
    },
    [handleCheckboxToggle],
  );

  const columns: TreeColumnDef<TablePickerTreeNode>[] = useMemo(
    () => [
      {
        id: "name",
        grow: true,
        cell: ({ node }) => (
          <Group gap="xs" wrap="nowrap">
            <Icon name={TYPE_ICONS[node.data.type]} c="brand" />
            {node.data.name}
          </Group>
        ),
      },
      {
        id: "owner",
        header: t`Owner`,
        size: 140,
        cell: ({ node }) => {
          if (node.data.type !== "table" || !node.data.table) {
            return null;
          }
          const ownerId = node.data.table.owner_user_id;
          if (ownerId != null && ownerNameById.has(ownerId)) {
            return ownerNameById.get(ownerId);
          }
          return node.data.table.owner_email ?? null;
        },
      },
      {
        id: "rows",
        header: t`Rows`,
        size: 80,
        cell: ({ node }) => {
          if (node.data.type !== "table" || !node.data.table) {
            return null;
          }
          const rowCount = node.data.table.estimated_row_count;
          return rowCount != null ? formatNumber(rowCount) : null;
        },
      },
      {
        id: "published",
        header: t`Published`,
        size: 80,
        cell: ({ node }) => {
          if (node.data.type !== "table" || !node.data.table) {
            return null;
          }
          return node.data.table.is_published ? (
            <Icon name="verified_round" c="success" aria-label={t`Published`} />
          ) : null;
        },
      },
    ],
    [ownerNameById, formatNumber],
  );

  const instance = useTreeTable({
    data: treeData,
    columns,
    getChildren: (node) => node.children,
    getNodeId: (node) => node.id,
    isExpandable: (node) => node.type !== "table",
    isDisabled: (node) => Boolean(node.isDisabled),
    expandedIds,
    onExpandedChange: handleExpandedChange,
    selectionMode: "none",
    enableKeyboardNav: true,
  });

  instanceRef.current = instance;

  useEffect(() => {
    if (selectedItemsCount === 0) {
      lastSelectedTableIndex.current = null;
    }
  }, [selectedItemsCount]);

  useEffect(() => {
    for (const node of instance.flatNodes) {
      if (
        node.isExpanded &&
        node.hasChildren &&
        node.data.children?.length === 0
      ) {
        const nodePath = nodeToTreePath(node.data);
        reload(nodePath);
      }
    }
  }, [instance.flatNodes, reload]);

  const isChildrenLoading = useCallback(
    (node: FlatTreeNode<TablePickerTreeNode>) => {
      return (
        node.isExpanded && node.hasChildren && node.data.children?.length === 0
      );
    },
    [],
  );

  const handleRowClick = useCallback(
    (node: FlatTreeNode<TablePickerTreeNode>) => {
      if (node.isDisabled) {
        return;
      }

      const isActive = isNodeActive(node.data, path, selectedItemsCount);
      const hasChildren = node.data.type !== "table";

      if (selectedItemsCount > 0) {
        if (hasChildren) {
          onToggle(node.data.nodeKey);
        }
        return;
      }

      if (isActive && hasChildren) {
        onToggle(node.data.nodeKey);
      } else {
        if (!node.isExpanded && hasChildren) {
          onToggle(node.data.nodeKey, true);
        }
        onChange(nodeToTreePath(node.data));
      }
    },
    [path, selectedItemsCount, onToggle, onChange],
  );

  return (
    <TreeTable
      instance={instance}
      showHeader
      showCheckboxes
      onRowClick={handleRowClick}
      getSelectionState={getSelectionState}
      onCheckboxClick={handleCheckboxClick}
      isChildrenLoading={isChildrenLoading}
    />
  );
}

function isNodeActive(
  node: TablePickerTreeNode,
  path: TreePath,
  selectedItemsCount: number,
): boolean {
  if (selectedItemsCount > 0) {
    return false;
  }

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

function findOriginalNode(
  tree: RootNode,
  treeNode: TablePickerTreeNode,
):
  | RootNode["children"][number]
  | RootNode["children"][number]["children"][number]
  | RootNode["children"][number]["children"][number]["children"][number]
  | null {
  for (const db of tree.children) {
    if (
      treeNode.type === "database" &&
      db.value.databaseId === treeNode.databaseId
    ) {
      return db;
    }
    for (const schema of db.children) {
      if (
        treeNode.type === "schema" &&
        schema.value.databaseId === treeNode.databaseId &&
        schema.value.schemaName === treeNode.schemaName
      ) {
        return schema;
      }
      for (const table of schema.children) {
        if (
          treeNode.type === "table" &&
          table.value.tableId === treeNode.tableId
        ) {
          return table;
        }
      }
    }
  }
  return null;
}
