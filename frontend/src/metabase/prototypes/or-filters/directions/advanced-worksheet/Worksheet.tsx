import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";

import { ClauseToken } from "./ClauseToken";
import S from "./Worksheet.module.css";
import {
  type Connector,
  MAX_DEPTH,
  type WorksheetRow,
  addFilterToRow,
  createRow,
  duplicateBlock,
  getBlockRange,
  getProjectedDepth,
  getVisibleRows,
  moveBlock,
  removeBlock,
  removeFilterFromRow,
  toggle,
  ungroupRow,
  updateRow,
} from "./rows";

const INDENT_PX = 80;
const LABEL_WIDTH_PX = 64;

type DragState = { activeId: string; overId: string; offsetX: number };

type WorksheetProps = {
  query: Lib.Query;
  stageIndex: number;
  rows: WorksheetRow[];
  onChange: (rows: WorksheetRow[]) => void;
};

/**
 * Direction C's worksheet: one line per group, every connector switchable on
 * its own. Drag a line by its handle to reorder it; drag sideways to nest it.
 */
export function Worksheet({
  query,
  stageIndex,
  rows,
  onChange,
}: WorksheetProps) {
  const [autoOpenRowId, setAutoOpenRowId] = useState<string>();
  const [drag, setDrag] = useState<DragState>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const visibleRows = getVisibleRows(rows, drag?.activeId);
  const projectedDepth =
    drag &&
    getProjectedDepth(
      rows,
      drag.activeId,
      drag.overId,
      drag.offsetX,
      INDENT_PX,
    );

  const insertEmptyRow = (index: number, depth: number) => {
    const row = createRow(depth);
    onChange([...rows.slice(0, index), row, ...rows.slice(index)]);
    setAutoOpenRowId(row.id);
  };

  const lastRow = rows[rows.length - 1];

  const handleDragMove = ({ active, over, delta }: DragMoveEvent) =>
    setDrag({
      activeId: String(active.id),
      overId: String(over?.id ?? active.id),
      offsetX: delta.x,
    });

  const handleDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const activeId = String(active.id);
    const overId = String(over?.id ?? active.id);
    const depth = getProjectedDepth(rows, activeId, overId, delta.x, INDENT_PX);
    setDrag(undefined);
    onChange(moveBlock(rows, activeId, overId, depth));
  };

  return (
    <Box ff="monospace">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) =>
          setDrag({
            activeId: String(active.id),
            overId: String(active.id),
            offsetX: 0,
          })
        }
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDrag(undefined)}
      >
        <SortableContext
          items={visibleRows.map((row) => row.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleRows.map((row, visibleIndex) => {
            const index = rows.indexOf(row);
            const isActive = row.id === drag?.activeId;
            return (
              <RowLine
                key={row.id}
                query={query}
                stageIndex={stageIndex}
                row={row}
                depth={isActive ? (projectedDepth ?? row.depth) : row.depth}
                isFirst={visibleIndex === 0}
                isAutoOpened={row.id === autoOpenRowId}
                onChange={(update) => onChange(updateRow(rows, row.id, update))}
                onDismissEmpty={() => {
                  if (row.filters.length === 0) {
                    onChange(rows.filter((other) => other !== row));
                  }
                }}
                onAddSubgroup={() =>
                  insertEmptyRow(getBlockRange(rows, index).end, row.depth + 1)
                }
                onUngroup={() => onChange(ungroupRow(rows, index))}
                onDuplicate={() =>
                  onChange(
                    duplicateBlock(rows, index, (filter) =>
                      toFilterClause(query, stageIndex, filter),
                    ),
                  )
                }
                onRemove={() => onChange(removeBlock(rows, index))}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      <Group gap="md" mt="sm" pl="lg">
        <UnstyledButton
          c="text-secondary"
          fz="sm"
          onClick={() => insertEmptyRow(rows.length, 0)}
        >
          <Group gap="xs">
            <Icon name="add" />
            {t`Filter`}
          </Group>
        </UnstyledButton>
        <UnstyledButton
          c="text-secondary"
          fz="sm"
          onClick={() =>
            insertEmptyRow(
              rows.length,
              lastRow ? Math.min(lastRow.depth + 1, MAX_DEPTH) : 0,
            )
          }
        >
          <Group gap="xs">
            <Icon name="add" />
            {t`Group`}
          </Group>
        </UnstyledButton>
      </Group>
    </Box>
  );
}

type RowLineProps = {
  query: Lib.Query;
  stageIndex: number;
  row: WorksheetRow;
  depth: number;
  isFirst: boolean;
  isAutoOpened: boolean;
  onChange: (update: (row: WorksheetRow) => WorksheetRow) => void;
  onDismissEmpty: () => void;
  onAddSubgroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function RowLine({
  query,
  stageIndex,
  row,
  depth,
  isFirst,
  isAutoOpened,
  onChange,
  onDismissEmpty,
  onAddSubgroup,
  onUngroup,
  onDuplicate,
  onRemove,
}: RowLineProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const toggleConnector = (connectorIndex: number) =>
    onChange((current) => ({
      ...current,
      connectors: current.connectors.map((connector, index) =>
        index === connectorIndex ? toggle(connector) : connector,
      ),
    }));

  const replaceFilter = (filterIndex: number, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    onChange((current) => ({
      ...current,
      filters: current.filters.map((filter, index) =>
        index === filterIndex ? clause : filter,
      ),
    }));
  };

  const isEmpty = row.filters.length === 0;
  const nextConnector = row.connectors[row.connectors.length - 1] ?? "and";

  return (
    <Box
      ref={setNodeRef}
      className={S.line}
      data-dragging={isDragging}
      style={{
        // Sideways drag changes the depth, not the position.
        transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
        transition,
      }}
    >
      <ActionIcon
        ref={setActivatorNodeRef}
        variant="subtle"
        c="text-secondary"
        className={S.handle}
        aria-label={t`Drag to move or nest`}
        {...attributes}
        {...listeners}
      >
        <Icon name="grabber" />
      </ActionIcon>
      <Box w={depth * INDENT_PX} style={{ transition: "width 0.1s" }} />
      <Box w={LABEL_WIDTH_PX}>
        {isFirst ? (
          <Text c="text-secondary">{t`Where`}</Text>
        ) : (
          <ConnectorToggle
            connector={row.connector}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                connector: toggle(current.connector),
              }))
            }
          />
        )}
      </Box>
      {row.filters.flatMap((filter, index) => [
        index > 0 && (
          <ConnectorToggle
            key={`connector-${index}`}
            connector={row.connectors[index - 1]}
            onToggle={() => toggleConnector(index - 1)}
          />
        ),
        <ClauseToken
          key={index}
          query={query}
          stageIndex={stageIndex}
          clause={filter}
          onReplace={(filterable) => replaceFilter(index, filterable)}
          onRemove={() =>
            onChange((current) => removeFilterFromRow(current, index))
          }
        />,
      ])}
      <Box className={S.lineActions} data-always-visible={isEmpty}>
        <AddFilterButton
          query={query}
          stageIndex={stageIndex}
          label={isEmpty ? t`Filter` : nextConnector}
          defaultOpened={isAutoOpened}
          onAdd={(filterable) => {
            const clause = toFilterClause(query, stageIndex, filterable);
            onChange((current) => addFilterToRow(current, clause));
          }}
          onDismiss={onDismissEmpty}
        />
        <RowMenu
          canAddSubgroup={row.depth < MAX_DEPTH}
          canUngroup={row.depth > 0}
          onAddSubgroup={onAddSubgroup}
          onUngroup={onUngroup}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </Box>
    </Box>
  );
}

type ConnectorToggleProps = {
  connector: Connector;
  onToggle: () => void;
};

/** Figma "operator toggle": one click switches this connector only. */
function ConnectorToggle({ connector, onToggle }: ConnectorToggleProps) {
  return (
    <Tooltip label={t`Switch to “${toggle(connector)}”`}>
      <UnstyledButton className={S.connector} onClick={onToggle}>
        {connector}
        <Icon name="refresh" size={12} />
      </UnstyledButton>
    </Tooltip>
  );
}

type AddFilterButtonProps = {
  query: Lib.Query;
  stageIndex: number;
  label: string;
  defaultOpened: boolean;
  onAdd: (filterable: Lib.Filterable) => void;
  onDismiss: () => void;
};

function AddFilterButton({
  query,
  stageIndex,
  label,
  defaultOpened,
  onAdd,
  onDismiss,
}: AddFilterButtonProps) {
  const [isOpened, setIsOpened] = useState(defaultOpened);
  // FilterPicker calls onClose right after onSelect; that close is not a dismissal.
  const hasSelected = useRef(false);

  const open = () => {
    hasSelected.current = false;
    setIsOpened(true);
  };

  const dismiss = () => {
    setIsOpened(false);
    if (!hasSelected.current) {
      onDismiss();
    }
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      // Rendered inside the worksheet's popover, so clicking the picker is not
      // an outside click for it.
      withinPortal={false}
      onChange={(opened) => (opened ? open() : dismiss())}
    >
      <Popover.Target>
        <Button
          size="compact-md"
          variant="subtle"
          c="text-secondary"
          fw="normal"
          data-opened={isOpened}
          leftSection={<Icon name="add" />}
          onClick={() => (isOpened ? dismiss() : open())}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          onSelect={(filterable) => {
            hasSelected.current = true;
            onAdd(filterable);
            setIsOpened(false);
          }}
          onClose={dismiss}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type RowMenuProps = {
  canAddSubgroup: boolean;
  canUngroup: boolean;
  onAddSubgroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

function RowMenu({
  canAddSubgroup,
  canUngroup,
  onAddSubgroup,
  onUngroup,
  onDuplicate,
  onRemove,
}: RowMenuProps) {
  return (
    // Rendered inside the worksheet's popover, so a click on an item is not
    // an outside click that closes it.
    <Menu position="bottom-start" withinPortal={false}>
      <Menu.Target>
        <ActionIcon variant="subtle" c="text-secondary" aria-label={t`More`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown ff="monospace">
        <Menu.Item disabled={!canAddSubgroup} onClick={onAddSubgroup}>
          {t`Add subgroup`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item disabled={!canUngroup} onClick={onUngroup}>
          {t`Ungroup`}
        </Menu.Item>
        <Menu.Item onClick={onDuplicate}>{t`Duplicate`}</Menu.Item>
        <Menu.Item c="feedback-negative" onClick={onRemove}>
          {t`Remove group`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
