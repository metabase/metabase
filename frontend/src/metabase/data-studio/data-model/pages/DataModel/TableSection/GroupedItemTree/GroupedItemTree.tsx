import type { Row } from "@tanstack/react-table";
import {
  type DragEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useNavigate } from "metabase/router";
import {
  ActionIcon,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./GroupedItemTree.module.css";

/** A segment or measure row; `memberId` is set when it can join groups */
export type TreeItemNode = {
  kind: "item";
  id: string;
  memberId: number | null;
  name: string;
  icon: IconName;
  href?: string;
  definition?: ReactNode;
  /** Badges after the name, like Default */
  badges?: ReactNode;
  isMuted?: boolean;
  actions?: ReactNode;
};

/** A group of items, shown like a folder */
export type TreeGroupNode = {
  kind: "group";
  id: string;
  /** Set for real groups, which items can be dragged into */
  groupId: string | null;
  name: string;
  definition?: ReactNode;
  badges?: ReactNode;
  isMuted?: boolean;
  actions?: ReactNode;
  /** Groups inside it first, then its items */
  children: TreeNode[];
};

export type TreeNode = TreeItemNode | TreeGroupNode;

/** What's being dragged, and the group it's leaving (`null`: the top level) */
type DraggedNode =
  | { kind: "item"; memberId: number; fromGroupId: string | null }
  | { kind: "group"; groupId: string; fromGroupId: string | null };

const DRAG_TYPE = "application/x-metabase-group-member";

// Fits accept and dismiss buttons, or a ⋯ menu. One width for every list, so
// the Name and Definition columns line up between lists on the same page.
const ACTIONS_WIDTH = 96;

const matchesQuery = (query: string, name: string) =>
  name.toLowerCase().includes(query.trim().toLowerCase());

/** Groups whose name matches keep everything in them; others keep matches */
function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  if (query.trim() === "") {
    return nodes;
  }
  return nodes.flatMap((node): TreeNode[] => {
    if (matchesQuery(query, node.name)) {
      return [node];
    }
    if (node.kind === "item") {
      return [];
    }
    const children = filterNodes(node.children, query);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/** A group's id and the ids of every group inside it, at any depth */
function getGroupSubtreeIds(nodes: TreeNode[], groupId: string) {
  const ids = new Set<string>();
  const visit = (children: TreeNode[], isInside: boolean) =>
    children.forEach((node) => {
      if (node.kind !== "group") {
        return;
      }
      const isInGroup = isInside || node.groupId === groupId;
      if (isInGroup && node.groupId != null) {
        ids.add(node.groupId);
      }
      visit(node.children, isInGroup);
    });
  visit(nodes, false);
  return ids;
}

/**
 * Groups as nested folder nodes. A group whose parent is gone sits at the top
 * level; `toNode` gets the node's child group nodes to put before its items.
 */
export function nestGroups<
  Group extends { id: string; parentGroupId?: string },
>(
  groups: Group[],
  toNode: (group: Group, childGroups: TreeGroupNode[]) => TreeGroupNode,
): TreeGroupNode[] {
  const ids = new Set(groups.map(({ id }) => id));
  const getParentId = ({ id, parentGroupId }: Group) =>
    parentGroupId != null && parentGroupId !== id && ids.has(parentGroupId)
      ? parentGroupId
      : null;
  const build = (parentId: string | null): TreeGroupNode[] =>
    groups
      .filter((group) => getParentId(group) === parentId)
      .map((group) => toNode(group, build(group.id)));
  return build(null);
}

type GroupedItemTreeProps = {
  nodes: TreeNode[];
  /** Absent hides the search and New buttons above the list */
  searchPlaceholder?: string;
  newItemButton?: ReactNode;
  newGroupLabel?: string;
  onNewGroup?: () => void;
  emptyMessage: string;
  emptyIcon: IconName;
  definitionHeader: string;
  /** An item dragged into a group, out of one, or between two */
  onMove?: (
    memberId: number,
    fromGroupId: string | null,
    toGroupId: string | null,
  ) => void;
  /** A group dragged into another group, or out to the top level */
  onMoveGroup?: (groupId: string, toGroupId: string | null) => void;
};

/**
 * PROTOTYPE: a searchable list of segments or measures with their groups as
 * folders, like the Library's collections. Items and groups drag into and out
 * of groups; lists without the move callbacks don't drag.
 */
export function GroupedItemTree({
  nodes,
  searchPlaceholder,
  newItemButton,
  newGroupLabel,
  onNewGroup,
  emptyMessage,
  emptyIcon,
  definitionHeader,
  onMove,
  onMoveGroup,
}: GroupedItemTreeProps) {
  const [query, setQuery] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggedRef = useRef<DraggedNode | null>(null);
  const visibleNodes = useMemo(() => filterNodes(nodes, query), [nodes, query]);
  const navigate = useNavigate();

  const columns = useMemo<TreeTableColumnDef<TreeNode>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        minWidth: 240,
        cell: ({ row }) => {
          const node = row.original;
          const icon = node.kind === "group" ? "folder" : node.icon;
          const nameCell = (
            <Group gap="sm" wrap="nowrap" miw={0}>
              <EntityNameCell
                icon={icon}
                iconColor={node.isMuted ? "icon-secondary" : "core-brand"}
                nameColor={node.isMuted ? "text-secondary" : undefined}
                name={node.name}
              />
              {node.badges}
            </Group>
          );
          return node.kind === "item" && node.href ? (
            <Link
              to={node.href}
              draggable={false}
              style={{
                display: "flex",
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {nameCell}
            </Link>
          ) : (
            nameCell
          );
        },
      },
      {
        id: "definition",
        header: definitionHeader,
        minWidth: 240,
        cell: ({ row }) => row.original.definition ?? null,
      },
      {
        id: "actions",
        width: ACTIONS_WIDTH,
        cell: ({ row }) => (
          <Flex justify="flex-end" w="100%">
            {row.original.actions}
          </Flex>
        ),
      },
    ],
    [definitionHeader],
  );

  const instance = useTreeTableInstance<TreeNode>({
    data: visibleNodes,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => (node.kind === "group" ? node.children : undefined),
    getRowCanExpand: (row) => row.original.kind === "group",
    defaultExpanded: true,
  });

  // A row's drop target: a group for itself, an item's group for the item
  const getDropGroupId = (row: Row<TreeNode>): string | null => {
    if (row.original.kind === "group") {
      return row.original.groupId;
    }
    const parent = row.getParentRow()?.original;
    return parent?.kind === "group" ? parent.groupId : null;
  };

  // Lists without the move callbacks neither start nor accept drags
  const getDraggedNode = (
    node: TreeNode,
    fromGroupId: string | null,
  ): DraggedNode | null => {
    if (node.kind === "item") {
      return onMove && node.memberId != null
        ? { kind: "item", memberId: node.memberId, fromGroupId }
        : null;
    }
    return onMoveGroup && node.groupId != null
      ? { kind: "group", groupId: node.groupId, fromGroupId }
      : null;
  };

  // A group can't go into itself or a group inside it
  const canDropInto = (toGroupId: string | null) => {
    const dragged = draggedRef.current;
    if (!dragged || dragged.fromGroupId === toGroupId) {
      return false;
    }
    return (
      dragged.kind === "item" ||
      toGroupId == null ||
      !getGroupSubtreeIds(nodes, dragged.groupId).has(toGroupId)
    );
  };

  const handleDrop = (event: DragEvent, toGroupId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetId(null);
    const dragged = draggedRef.current;
    if (!dragged || !canDropInto(toGroupId)) {
      return;
    }
    draggedRef.current = null;
    if (dragged.kind === "item") {
      onMove?.(dragged.memberId, dragged.fromGroupId, toGroupId);
    } else {
      onMoveGroup?.(dragged.groupId, toGroupId);
    }
  };

  const getRowProps = (row: Row<TreeNode>) => {
    const node = row.original;
    const isProposedGroup = node.kind === "group" && node.groupId == null;
    const toGroupId = getDropGroupId(row);
    const parent = row.getParentRow()?.original;
    const fromGroupId = parent?.kind === "group" ? parent.groupId : null;
    const dragged = getDraggedNode(node, fromGroupId);
    return {
      draggable: dragged != null,
      "data-drop-over": toGroupId != null && dropTargetId === toGroupId,
      onDragStart: (event: DragEvent) => {
        if (!dragged) {
          return;
        }
        draggedRef.current = dragged;
        // Some browsers only start a drag that carries data
        event.dataTransfer.setData(DRAG_TYPE, node.id);
        event.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        draggedRef.current = null;
        setDropTargetId(null);
      },
      onDragOver: (event: DragEvent) => {
        if (!draggedRef.current) {
          return;
        }
        // Rows that can't take the drop don't hand it to the list either
        event.stopPropagation();
        if (!isProposedGroup && canDropInto(toGroupId)) {
          event.preventDefault();
          setDropTargetId(toGroupId ?? "top");
        } else {
          setDropTargetId(null);
        }
      },
      onDrop: (event: DragEvent) => handleDrop(event, toGroupId),
    };
  };

  return (
    <Stack gap="lg">
      {searchPlaceholder != null && (
        <Flex gap="lg">
          <TextInput
            placeholder={searchPlaceholder}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            flex="1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {newItemButton}
          {onNewGroup && newGroupLabel && (
            <Tooltip label={newGroupLabel}>
              <ActionIcon
                size="lg"
                variant="default"
                aria-label={newGroupLabel}
                onClick={onNewGroup}
              >
                <Icon name="add_folder" />
              </ActionIcon>
            </Tooltip>
          )}
        </Flex>
      )}
      <Card
        withBorder
        p={0}
        className={S.tree}
        // Dropping on the list outside any group moves to the top level
        onDragOver={(event: DragEvent) => {
          if (canDropInto(null)) {
            event.preventDefault();
            setDropTargetId("top");
          }
        }}
        onDrop={(event: DragEvent) => handleDrop(event, null)}
      >
        <TreeTable
          instance={instance}
          getRowProps={getRowProps}
          emptyState={
            <ListEmptyState
              label={
                query.trim() !== ""
                  ? t`No results for "${query.trim()}"`
                  : emptyMessage
              }
              icon={query.trim() !== "" ? undefined : emptyIcon}
            />
          }
          onRowClick={(row, event) => {
            const node = row.original;
            if (row.getCanExpand()) {
              row.toggleExpanded();
            } else if (
              node.kind === "item" &&
              node.href &&
              // The name's link and the row's buttons handle their own clicks
              !(
                event.target instanceof Element &&
                event.target.closest("a, button")
              )
            ) {
              navigate(node.href);
            }
          }}
        />
      </Card>
    </Stack>
  );
}
