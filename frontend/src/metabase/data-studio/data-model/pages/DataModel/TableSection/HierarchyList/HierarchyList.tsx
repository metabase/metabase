import type { Row } from "@tanstack/react-table";
import {
  type DragEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import {
  type Hierarchy,
  type HierarchyLevel,
  getHierarchyType,
  getHierarchyTypeLabel,
  useTableHierarchies,
} from "metabase/metadata/hierarchies";
import { useNavigate } from "metabase/router";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  rem,
  useTreeTableInstance,
} from "metabase/ui";
import type { FieldId, IconName, Table } from "metabase-types/api";

import { InferredIcon } from "../InferenceReview";

import S from "./HierarchyList.module.css";
import { HierarchyMenu } from "./HierarchyMenu";
import { HierarchyModal } from "./HierarchyModal";
import { useLevelColumns } from "./use-level-columns";

// Fits accept and dismiss buttons, or a ⋯ menu, as in Segments and Measures
const ACTIONS_WIDTH = 96;

const DRAG_TYPE = "application/x-metabase-hierarchy-level";

type HierarchyNode = {
  id: string;
  kind: "hierarchy" | "level";
  name: string;
  icon: IconName;
  /** `null` for a proposal, which can't be edited or dragged into */
  hierarchyId: string | null;
  /** A level's position, top first */
  levelIndex?: number;
  /** The next level down, or nothing */
  children?: HierarchyNode[];
  href?: string;
  isMuted?: boolean;
  badges?: ReactNode;
  definition?: ReactNode;
  actions?: ReactNode;
};

type DraggedLevel = { hierarchyId: string; levelIndex: number };

// `null` makes a new hierarchy; `undefined` means the modal is closed
type EditingHierarchy = Hierarchy | null | undefined;

type HierarchyListProps = {
  table: Table;
  /** Where a level's column opens; levels reached through a key don't */
  getFieldHref?: (fieldId: FieldId) => string;
};

/**
 * PROTOTYPE: mocked. A table's hierarchies (doc 06) as a list: each level
 * sits under the one above it, and dragging a level onto another puts it
 * right under that one. The ones sync made carry the AI icon until someone
 * confirms or edits them.
 */
export function HierarchyList({ table, getFieldHref }: HierarchyListProps) {
  const { items, hierarchies, save, remove } = useTableHierarchies(table);
  const { columns, findColumn } = useLevelColumns(table);
  const [query, setQuery] = useState("");
  const [editingHierarchy, setEditingHierarchy] = useState<EditingHierarchy>();
  const fields = table.fields ?? [];
  const canEdit = table.can_write === true;

  const getFieldName = (fieldId: FieldId | undefined) =>
    fields.find(({ id }) => id === fieldId)?.display_name;

  const toLevelNodes = (
    hierarchy: Pick<Hierarchy, "levels" | "defaultLevelFieldId">,
    hierarchyId: string | null,
    nodeId: string,
    isMuted: boolean,
    index = 0,
  ): HierarchyNode[] => {
    const level = hierarchy.levels[index];
    if (level == null) {
      return [];
    }
    const column = findColumn(level);
    const isDefault =
      level.fieldId ===
      (hierarchy.defaultLevelFieldId ?? hierarchy.levels[0]?.fieldId);
    return [
      {
        id: `${nodeId}:level:${index}`,
        kind: "level",
        name: column?.label ?? t`Missing column`,
        icon: column?.icon ?? "unknown",
        hierarchyId,
        levelIndex: index,
        isMuted,
        href:
          level.viaFieldId == null ? getFieldHref?.(level.fieldId) : undefined,
        badges: isDefault && hierarchy.levels.length > 1 && (
          <Badge variant="light" color="neutral">{t`Starts here`}</Badge>
        ),
        definition: <Text c="text-secondary">{t`Level ${index + 1}`}</Text>,
        actions: hierarchyId != null && canEdit && (
          <LevelMenu
            isDefault={isDefault}
            onMakeDefault={() =>
              updateHierarchy(hierarchyId, (current) => ({
                ...current,
                defaultLevelFieldId: level.fieldId,
              }))
            }
            onRemove={() =>
              updateHierarchy(hierarchyId, (current) => ({
                ...current,
                levels: current.levels.filter((_, at) => at !== index),
              }))
            }
          />
        ),
        children: toLevelNodes(
          hierarchy,
          hierarchyId,
          nodeId,
          isMuted,
          index + 1,
        ),
      },
    ];
  };

  const getDefinition = (
    hierarchy: Pick<
      Hierarchy,
      "kind" | "levels" | "parentKeyFieldId" | "depthFieldId" | "pathFieldId"
    >,
  ) => {
    const typeLabel = getHierarchyTypeLabel(getHierarchyType(hierarchy.kind));
    if (hierarchy.kind !== "recursive") {
      const count = hierarchy.levels.length;
      return count === 1 ? t`1 level` : t`${count} levels`;
    }
    const parts = [
      t`Parent key: ${getFieldName(hierarchy.parentKeyFieldId) ?? "—"}`,
    ];
    const depthName = getFieldName(hierarchy.depthFieldId);
    const pathName = getFieldName(hierarchy.pathFieldId);
    if (depthName) {
      parts.push(t`Depth: ${depthName}`);
    }
    if (pathName) {
      parts.push(t`Path: ${pathName}`);
    }
    return `${typeLabel} · ${parts.join(" · ")}`;
  };

  const hierarchyNodes = items.map(
    ({ hierarchy, inference }): HierarchyNode => {
      const nodeId = `hierarchy:${hierarchy.id}`;
      return {
        id: nodeId,
        kind: "hierarchy",
        name: hierarchy.name,
        icon: "network",
        hierarchyId: hierarchy.id,
        badges: inference != null && (
          <InferredIcon
            description={inference}
            onConfirm={canEdit ? () => save(hierarchy) : undefined}
          />
        ),
        definition: <Text c="text-secondary">{getDefinition(hierarchy)}</Text>,
        actions: canEdit && (
          <HierarchyMenu
            hierarchyName={hierarchy.name}
            onEdit={() => setEditingHierarchy(hierarchy)}
            onDelete={() => remove(hierarchy)}
          />
        ),
        children: toLevelNodes(hierarchy, hierarchy.id, nodeId, false),
      };
    },
  );

  function updateHierarchy(
    hierarchyId: string,
    update: (current: Hierarchy) => Hierarchy,
  ) {
    const hierarchy = hierarchies.find(({ id }) => id === hierarchyId);
    if (hierarchy) {
      save({ ...update(hierarchy), source: "admin" });
    }
  }

  // Puts the dragged level right under the target, or at the top when
  // dropped on the hierarchy's own row (`afterIndex` -1)
  const moveLevel = (
    from: DraggedLevel,
    toHierarchyId: string,
    afterIndex: number,
  ) => {
    const source = hierarchies.find(({ id }) => id === from.hierarchyId);
    const target = hierarchies.find(({ id }) => id === toHierarchyId);
    const moved = source?.levels[from.levelIndex];
    if (!source || !target || !moved || target.kind === "recursive") {
      return;
    }
    if (source.id === target.id) {
      if (afterIndex === from.levelIndex) {
        return;
      }
      const levels = [...source.levels];
      levels.splice(from.levelIndex, 1);
      const insertAt =
        afterIndex === -1
          ? 0
          : from.levelIndex < afterIndex
            ? afterIndex
            : afterIndex + 1;
      levels.splice(insertAt, 0, moved);
      save({ ...source, levels, source: "admin" });
      return;
    }
    if (target.levels.some((level) => isSameLevel(level, moved))) {
      return;
    }
    const targetLevels = [...target.levels];
    targetLevels.splice(afterIndex + 1, 0, moved);
    save({ ...target, levels: targetLevels, source: "admin" });
    save({
      ...source,
      levels: source.levels.filter((_, at) => at !== from.levelIndex),
      source: "admin",
    });
  };

  const visibleNodes = filterNodes(hierarchyNodes, query);

  return (
    <Stack gap={rem(48)}>
      <Stack gap="lg">
        <Flex gap="lg">
          <TextInput
            placeholder={t`Search hierarchies`}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            flex="1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {canEdit && (
            <Button
              variant="filled"
              size="lg"
              leftSection={<Icon name="add" />}
              onClick={() => setEditingHierarchy(null)}
            >
              {t`New hierarchy`}
            </Button>
          )}
        </Flex>
        <HierarchyTreeTable
          nodes={visibleNodes}
          emptyMessage={
            query.trim() !== ""
              ? t`No results for "${query.trim()}"`
              : t`No hierarchies yet`
          }
          onMoveLevel={canEdit ? moveLevel : undefined}
        />
      </Stack>
      {editingHierarchy !== undefined && (
        <HierarchyModal
          // Fresh state per hierarchy
          key={editingHierarchy?.id ?? "new"}
          hierarchy={editingHierarchy}
          fields={fields}
          columns={columns}
          onSave={(hierarchy) => {
            save({
              ...hierarchy,
              syncKey: editingHierarchy?.syncKey,
            });
            setEditingHierarchy(undefined);
          }}
          onClose={() => setEditingHierarchy(undefined)}
        />
      )}
    </Stack>
  );
}

const isSameLevel = (a: HierarchyLevel, b: HierarchyLevel) =>
  a.fieldId === b.fieldId && a.viaFieldId === b.viaFieldId;

const matchesQuery = (query: string, name: string) =>
  name.toLowerCase().includes(query.trim().toLowerCase());

const getNodeNames = (node: HierarchyNode): string[] => [
  node.name,
  ...(node.children ?? []).flatMap(getNodeNames),
];

/** Every row with rows under it, at any depth */
const getExpandableIds = (nodes: HierarchyNode[]): string[] =>
  nodes.flatMap((node) =>
    node.children && node.children.length > 0
      ? [node.id, ...getExpandableIds(node.children)]
      : [],
  );

/** Hierarchies whose name or any level's name matches, whole */
function filterNodes(nodes: HierarchyNode[], query: string) {
  if (query.trim() === "") {
    return nodes;
  }
  return nodes.filter((node) =>
    getNodeNames(node).some((name) => matchesQuery(query, name)),
  );
}

function HierarchyTreeTable({
  nodes,
  emptyMessage,
  onMoveLevel,
}: {
  nodes: HierarchyNode[];
  emptyMessage: string;
  /** Without it, levels don't drag */
  onMoveLevel?: (
    from: DraggedLevel,
    toHierarchyId: string,
    afterIndex: number,
  ) => void;
}) {
  const navigate = useNavigate();
  const draggedRef = useRef<DraggedLevel | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const columns = useMemo<TreeTableColumnDef<HierarchyNode>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        minWidth: 240,
        cell: ({ row }) => {
          const node = row.original;
          return (
            <Group gap="sm" wrap="nowrap" miw={0}>
              <EntityNameCell
                icon={node.icon}
                iconColor={node.isMuted ? "icon-secondary" : "core-brand"}
                nameColor={node.isMuted ? "text-secondary" : undefined}
                name={node.name}
              />
              {node.badges}
            </Group>
          );
        },
      },
      {
        id: "definition",
        header: t`Definition`,
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
    [],
  );

  // Everything starts open, new hierarchies included; only what someone
  // collapses stays collapsed
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const expandableIds = getExpandableIds(nodes);
  const expanded = Object.fromEntries(
    expandableIds.map((id) => [id, !collapsedIds.includes(id)]),
  );
  const instance = useTreeTableInstance<HierarchyNode>({
    data: nodes,
    columns,
    getNodeId: (node) => node.id,
    getSubRows: (node) => node.children,
    getRowCanExpand: (row) => (row.original.children ?? []).length > 0,
    expanded,
    onExpandedChange: (updater) => {
      const next = typeof updater === "function" ? updater(expanded) : updater;
      setCollapsedIds(
        next === true ? [] : expandableIds.filter((id) => !next[id]),
      );
    },
  });

  // A level lands under a level, or at the top under its hierarchy's row
  const getDropTarget = (node: HierarchyNode) =>
    node.hierarchyId != null
      ? {
          hierarchyId: node.hierarchyId,
          afterIndex: node.kind === "level" ? (node.levelIndex ?? -1) : -1,
        }
      : null;

  const getRowProps = (row: Row<HierarchyNode>) => {
    const node = row.original;
    const target = getDropTarget(node);
    const isDraggable =
      onMoveLevel != null &&
      node.kind === "level" &&
      node.hierarchyId != null &&
      node.levelIndex != null;
    return {
      draggable: isDraggable,
      "data-drop-over": dropTargetId === node.id,
      onDragStart: (event: DragEvent) => {
        if (
          !isDraggable ||
          node.hierarchyId == null ||
          node.levelIndex == null
        ) {
          return;
        }
        draggedRef.current = {
          hierarchyId: node.hierarchyId,
          levelIndex: node.levelIndex,
        };
        // Some browsers only start a drag that carries data
        event.dataTransfer.setData(DRAG_TYPE, node.id);
        event.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        draggedRef.current = null;
        setDropTargetId(null);
      },
      onDragOver: (event: DragEvent) => {
        if (!draggedRef.current || !target) {
          return;
        }
        event.preventDefault();
        setDropTargetId(node.id);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const dragged = draggedRef.current;
        draggedRef.current = null;
        setDropTargetId(null);
        if (dragged && target) {
          onMoveLevel?.(dragged, target.hierarchyId, target.afterIndex);
        }
      },
    };
  };

  return (
    <Card withBorder p={0} className={S.tree}>
      <TreeTable
        instance={instance}
        getRowProps={getRowProps}
        emptyState={<ListEmptyState label={emptyMessage} icon="network" />}
        onRowClick={(row, event) => {
          const node = row.original;
          if (row.getCanExpand() && node.kind === "hierarchy") {
            row.toggleExpanded();
          } else if (
            node.href &&
            // The row's buttons handle their own clicks
            !(event.target instanceof Element && event.target.closest("button"))
          ) {
            navigate(node.href);
          }
        }}
      />
    </Card>
  );
}

function LevelMenu({
  isDefault,
  onMakeDefault,
  onRemove,
}: {
  isDefault: boolean;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t`Level actions`}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        {!isDefault && (
          <Menu.Item leftSection={<Icon name="star" />} onClick={onMakeDefault}>
            {t`Start questions here`}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<Icon name="close" />}
          c="feedback-negative"
          onClick={onRemove}
        >
          {t`Remove level`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
