import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { MutableRefObject, ReactNode } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  type DragEndEvent,
  Sortable,
  SortableList,
} from "metabase/common/components/Sortable";
import { useDndSensors } from "metabase/common/hooks";
import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import { moveElement } from "metabase/utils/arrays";
import type { Table } from "metabase-types/api";

import type { EventDefinition } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";
import { EventDefinitionEditor } from "../events/EventDefinitionEditor";
import { EventDefinitionSummary } from "../events/EventDefinitionSummary";
import { useTableQuery } from "../events/use-table-query";

import S from "./EventDefinitionListWidget.module.css";

const HANDLE_SIZE = 16;
const DRAG_DISTANCE = 15;

type ListItem = { id: string; event: EventDefinition };

const getItemId = (item: ListItem) => item.id;

type EventDefinitionListWidgetProps = SettingWidgetProps<EventDefinition[]> & {
  table: Table | undefined;
  addLabel?: string;
};

/**
 * A list of event definitions, edited one at a time and reordered by
 * dragging. Starting another edit, adding or removing cancels the current
 * edit, and nothing can be dragged during one.
 */
export const EventDefinitionListWidget = ({
  id,
  value,
  onChange,
  table,
  addLabel = t`Add an event`,
}: EventDefinitionListWidgetProps) => {
  const tableQuery = useTableQuery(table);
  const sensors = useDndSensors({ distance: DRAG_DISTANCE });
  // `value.length` while adding a new event.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const isAdding = editingIndex === value.length;
  const isDragDisabled = editingIndex !== null;
  // Events have no ids, and positions are stable while nothing is edited.
  const items = useMemo(
    () => value.map((event, index) => ({ id: `event-${index}`, event })),
    [value],
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

  const handleSortEnd = ({ id: movedId, newIndex }: DragEndEvent) => {
    const oldIndex = items.findIndex((item) => item.id === movedId);
    if (oldIndex !== newIndex) {
      onChange(moveElement(value, oldIndex, newIndex));
    }
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
                      handleRef={dragHandleRef}
                      listeners={dragHandleListeners}
                      hidden={isDragDisabled}
                    />
                  }
                >
                  {index === editingIndex ? (
                    editor
                  ) : (
                    <EventDefinitionSummary
                      name={item.event.name}
                      disabled={tableQuery === undefined}
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
      <ListRow>
        {isAdding ? (
          editor
        ) : (
          <Button
            variant="subtle"
            leftSection={<Icon name="add" />}
            disabled={tableQuery === undefined}
            onClick={() => setEditingIndex(value.length)}
          >
            {addLabel}
          </Button>
        )}
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
