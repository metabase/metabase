import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { MutableRefObject, ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  type DragEndEvent,
  Sortable,
  SortableList,
} from "metabase/common/components/Sortable";
import { useDndSensors, useToast } from "metabase/common/hooks";
import { useMetadataProvider } from "metabase/metadata-store";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import { moveElement } from "metabase/utils/arrays";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import { useSegmentDrag } from "../../segments/drag-context";
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
const DRAG_DISTANCE = 15;

type ListItem = { id: string; event: EventDefinition };

const getItemId = (item: ListItem) => item.id;

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
 * The add button adds an empty slot, to click and define or drop a segment
 * on. A palette segment dropped on an item becomes one more of its
 * conditions; dropped on an empty slot or the zone below the list, it's a
 * new event.
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
  const sensors = useDndSensors({ distance: DRAG_DISTANCE });
  // `value.length` while adding a new event.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Empty slots added with the add button, beyond the `minSlots` ones.
  const [addedSlotCount, setAddedSlotCount] = useState(0);
  const isAdding = editingIndex === value.length;
  const isDragDisabled = editingIndex !== null;
  // The editor for a new event takes the first empty slot's place.
  const emptySlotCount = Math.max(
    0,
    Math.max(0, minSlots - value.length) + addedSlotCount - (isAdding ? 1 : 0),
  );
  const emptySlotLabel = isPaletteOpen
    ? t`Drag an event segment here`
    : t`Click to define this step`;
  // Events have no ids, and positions are stable while nothing is edited.
  const items = useMemo(
    () => value.map((event, index) => ({ id: `event-${index}`, event })),
    [value],
  );

  // A new event fills the first empty slot: a `minSlots` one while there are
  // any, then one that was added.
  const fillSlot = () => {
    if (value.length >= minSlots) {
      setAddedSlotCount((count) => Math.max(0, count - 1));
    }
  };

  const handleSubmit = (event: EventDefinition) => {
    if (isAdding) {
      fillSlot();
    }
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

  const handleSortEnd = ({ id: movedId, newIndex }: DragEndEvent) => {
    const oldIndex = items.findIndex((item) => item.id === movedId);
    if (oldIndex !== newIndex) {
      onChange(moveElement(value, oldIndex, newIndex));
    }
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
    if (atIndex >= value.length) {
      fillSlot();
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
        <SortableList
          items={items}
          getId={getItemId}
          sensors={sensors}
          onSortEnd={handleSortEnd}
          renderItem={({ item, index }) => (
            <Sortable
              id={item.id}
              role="listitem"
              disabled={isDragDisabled}
              draggingStyle={{ opacity: 0.5 }}
            >
              {({ dragHandleRef, dragHandleListeners }) => (
                <ListRow
                  handle={
                    <DragHandle
                      n={index + 1}
                      handleRef={dragHandleRef}
                      listeners={dragHandleListeners}
                      disabled={isDragDisabled}
                    />
                  }
                >
                  {index === editingIndex ? (
                    editor
                  ) : (
                    <EventDefinitionSummary
                      name={item.event.name}
                      draggableEvent={item.event}
                      disabled={tableQuery === undefined}
                      dropTarget={{
                        accepts: isEventSegment,
                        onDrop: (segment) => handleDropSegment(segment, index),
                      }}
                      onEdit={() => setEditingIndex(index)}
                      onRemove={() => handleRemove(index)}
                    />
                  )}
                </ListRow>
              )}
            </Sortable>
          )}
        />
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
      {/* In a row of its own, so it lines up with the wells, not the numbers. */}
      <ListRow>
        <Button
          variant="light"
          leftSection={<Icon name="add" />}
          disabled={tableQuery === undefined}
          onClick={() => setAddedSlotCount((count) => count + 1)}
        >
          {addLabel}
        </Button>
      </ListRow>
    </Stack>
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

/** The step's number, in the handle's place, on rows and empty slots alike. */
const SlotNumber = ({ n }: { n: number }) => (
  <Text size="sm" c="text-tertiary" ta="center" lh={1}>
    {n}
  </Text>
);

type DragHandleProps = {
  /** The step's number, which is what's shown. */
  n: number;
  handleRef: MutableRefObject<HTMLElement | null>;
  listeners: SyntheticListenerMap | undefined;
  /** During an edit, when nothing can be dragged. */
  disabled: boolean;
};

/**
 * The step's number doubles as its reorder handle: the step's own grabber
 * drags it to the palette instead. Like other Metabase sortable lists, mouse
 * and touch only. Always mounted, since `Sortable` registers the handle
 * element once.
 */
const DragHandle = ({ n, handleRef, listeners, disabled }: DragHandleProps) => (
  <Box
    ref={(element: HTMLDivElement | null) => {
      handleRef.current = element;
    }}
    className={S.handle}
    data-disabled={disabled}
    data-testid="drag-handle"
    {...(disabled ? {} : listeners)}
  >
    <SlotNumber n={n} />
  </Box>
);
