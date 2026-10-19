import type { UniqueIdentifier } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { MutableRefObject, ReactNode } from "react";
import { useId, useMemo, useState } from "react";
import { t } from "ttag";

import { Sortable } from "metabase/common/components/Sortable";
import { useToast } from "metabase/common/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import { moveElement } from "metabase/utils/arrays";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import {
  type DropTarget,
  useDragItems,
  useDropTargetRegistration,
  useSegmentDrag,
} from "../../segments/drag-context";
import {
  addSegmentToEvent,
  isEventSegment,
  segmentToEventDefinition,
} from "../../segments/to-event-definition";
import type { PaletteSegment } from "../../segments/types";
import type { SettingWidgetProps } from "../../settings/types";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { EventDefinitionSummary } from "../events/EventDefinitionSummary";
import { SegmentDropZone } from "../events/SegmentDropZone";
import { useTableQuery } from "../events/use-table-query";

import S from "./EventDefinitionListWidget.module.css";

const HANDLE_SIZE = 16;

type EventDefinitionListWidgetProps = SettingWidgetProps<EventDefinition[]> & {
  table: Table | undefined;
  addLabel?: string;
  dropLabel?: string;
  /** Empty slots shown until the list has this many events. */
  minSlots?: number;
};

/**
 * A list of event definitions, edited one at a time and reordered by
 * dragging. Starting another edit, adding or removing submits the current
 * edit first, or discards it when it can't be submitted. Nothing can be
 * dragged during an edit.
 *
 * A palette segment dropped on an item becomes one more of its conditions;
 * dropped on an empty slot or the zone below the list, it's a new event. An
 * item dragged onto the palette drafts a segment from it. Needs a
 * `SegmentDragProvider` above it.
 */
export const EventDefinitionListWidget = ({
  id,
  value,
  onChange,
  table,
  addLabel = t`Add an event`,
  dropLabel = t`Drop a segment here to add it`,
  minSlots = 0,
}: EventDefinitionListWidgetProps) => {
  const { isPaletteOpen } = useSegmentDrag();
  const tableQuery = useTableQuery(table);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const [sendToast] = useToast();
  const listId = useId();
  // `value.length` while adding a new event.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const isAdding = editingIndex === value.length;
  const isDragDisabled = editingIndex !== null;
  // The editor for a new event takes the first empty slot's place.
  const emptySlotCount = Math.max(
    0,
    minSlots - value.length - (isAdding ? 1 : 0),
  );
  const emptySlotLabel = isPaletteOpen
    ? t`Drag an event segment here`
    : t`Click to define this step`;
  // Events have no ids, and positions are stable while nothing is edited.
  const itemIds = useMemo(
    () => value.map((_event, index) => `${listId}-event-${index}`),
    [value, listId],
  );
  useDragItems(
    value.map((event, index) => [itemIds[index], { kind: "event", event }]),
  );

  const handleSubmit = (event: EventDefinition) => {
    onChange(
      isAdding
        ? [...value, event]
        : value.map((other, index) => (index === editingIndex ? event : other)),
    );
    setEditingIndex(null);
  };

  const handleRemove = (removedIndex: number) => {
    onChange(value.filter((_event, index) => index !== removedIndex));
    setEditingIndex(null);
  };

  // Dropped anywhere but the palette, a dragged item lands on the nearest row.
  const reorderTarget: DropTarget = {
    collision: "closest",
    accepts: (drag) => itemIds.some((itemId) => itemId === drag.id),
    onDrop: (drag, overId) => {
      const oldIndex = itemIds.findIndex((itemId) => itemId === drag.id);
      const newIndex = itemIds.findIndex((itemId) => itemId === overId);
      if (oldIndex !== newIndex && newIndex >= 0) {
        onChange(moveElement(value, oldIndex, newIndex));
      }
    },
  };

  // A drop past the end adds an event; on an item, it adds a condition to it.
  const handleDropSegment = (segment: PaletteSegment, atIndex: number) => {
    const target = value[atIndex];
    const event = (() => {
      if (tableQuery === undefined) {
        return undefined;
      }
      return target === undefined
        ? segmentToEventDefinition(tableQuery, metadataProvider, segment)
        : addSegmentToEvent(tableQuery, metadataProvider, target, segment);
    })();
    if (event === undefined) {
      sendToast({
        icon: "warning",
        message: t`${segment.name} can't be used here yet.`,
      });
      return;
    }
    onChange(
      atIndex >= value.length
        ? [...value, event]
        : value.map((other, index) => (index === atIndex ? event : other)),
    );
    setEditingIndex(null);
  };

  const editor = tableQuery !== undefined && editingIndex !== null && (
    <EventDefinitionEditor
      key={`editor-${editingIndex}`}
      value={isAdding ? null : value[editingIndex]}
      tableQuery={tableQuery}
      onCancel={() => setEditingIndex(null)}
      onSubmit={handleSubmit}
    />
  );

  return (
    <Stack id={id} gap="sm">
      <Stack gap="sm" role="list">
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {value.map((event, index) => (
            <SortableRow
              key={itemIds[index]}
              id={itemIds[index]}
              reorderTarget={reorderTarget}
              isDragDisabled={isDragDisabled}
            >
              {index === editingIndex ? (
                editor
              ) : (
                <EventDefinitionSummary
                  name={event.name}
                  disabled={tableQuery === undefined}
                  dropTarget={{
                    accepts: isEventSegment,
                    onDrop: (segment) => handleDropSegment(segment, index),
                  }}
                  onEdit={() => setEditingIndex(index)}
                  onRemove={() => handleRemove(index)}
                />
              )}
            </SortableRow>
          ))}
        </SortableContext>
      </Stack>
      {isAdding && <ListRow>{editor}</ListRow>}
      {Array.from({ length: emptySlotCount }, (_slot, offset) => {
        const slotNumber = value.length + (isAdding ? 1 : 0) + offset + 1;
        return (
          <ListRow
            key={`slot-${slotNumber}`}
            handle={<SlotNumber n={slotNumber} />}
          >
            <EventDefinitionSummary
              name={undefined}
              placeholder={emptySlotLabel}
              empty
              disabled={tableQuery === undefined}
              dropTarget={{
                accepts: isEventSegment,
                onDrop: (segment) => handleDropSegment(segment, value.length),
              }}
              onEdit={() => setEditingIndex(value.length)}
            />
          </ListRow>
        );
      })}
      {emptySlotCount === 0 && (
        <ListRow>
          <SegmentDropZone
            label={dropLabel}
            accepts={isEventSegment}
            onDrop={(segment) => handleDropSegment(segment, value.length)}
          />
        </ListRow>
      )}
      <Box>
        <Button
          variant="light"
          leftSection={<Icon name="add" />}
          disabled={tableQuery === undefined}
          onClick={() => setEditingIndex(value.length)}
        >
          {addLabel}
        </Button>
      </Box>
    </Stack>
  );
};

type SortableRowProps = {
  id: UniqueIdentifier;
  reorderTarget: DropTarget;
  isDragDisabled: boolean;
  children: ReactNode;
};

const SortableRow = ({
  id,
  reorderTarget,
  isDragDisabled,
  children,
}: SortableRowProps) => {
  useDropTargetRegistration(id, reorderTarget);
  return (
    <Sortable
      id={id}
      role="listitem"
      disabled={isDragDisabled}
      draggingStyle={{ opacity: 0.5 }}
    >
      {({ dragHandleRef, dragHandleListeners }) => (
        <ListRow
          handle={
            <DragHandle
              handleRef={dragHandleRef}
              listeners={dragHandleListeners}
              hidden={isDragDisabled}
            />
          }
        >
          {children}
        </ListRow>
      )}
    </Sortable>
  );
};

type ListRowProps = {
  handle?: ReactNode;
  children: ReactNode;
};

/** Lines rows up whether or not they have a drag handle. */
const ListRow = ({ handle, children }: ListRowProps) => (
  <Group gap="xs" wrap="nowrap" align="center">
    <Box w={HANDLE_SIZE} style={{ flexShrink: 0 }}>
      {handle}
    </Box>
    <Box flex={1} miw={0}>
      {children}
    </Box>
  </Group>
);

/** Stands where the drag handle goes on a slot that has nothing to drag yet. */
const SlotNumber = ({ n }: { n: number }) => (
  <Text size="sm" c="text-tertiary" ta="center" lh={1}>
    {n}
  </Text>
);

type DragHandleProps = {
  handleRef: MutableRefObject<HTMLElement | null>;
  listeners: SyntheticListenerMap | undefined;
  hidden: boolean;
};

/**
 * Like other Metabase sortable lists, mouse and touch only. Hidden rather
 * than unmounted, since `Sortable` registers the handle element once.
 */
const DragHandle = ({ handleRef, listeners, hidden }: DragHandleProps) => (
  <Box
    ref={(element: HTMLDivElement | null) => {
      handleRef.current = element;
    }}
    className={S.handle}
    display={hidden ? "none" : "flex"}
    c="text-secondary"
    data-testid="drag-handle"
    {...listeners}
  >
    <Icon name="grabber" size={HANDLE_SIZE} />
  </Box>
);
