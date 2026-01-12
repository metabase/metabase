import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";
import type { CSSProperties, ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  Combobox,
  type MantineSize,
  Pill,
  PillsInput,
  ScrollArea,
  useCombobox,
} from "metabase/ui";

import S from "./ReorderableTagsInput.module.css";

export type Option = { value: string; label: string };

interface Props {
  data: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  maxValues?: number;
  placeholder?: string;
  size?: MantineSize;
  miw?: string | number;
  maw?: string | number;
  containerId?: string;
  useExternalDnd?: boolean;
  draggedItemId?: string | null;
  currentDroppable?: string | null;
  "data-testid"?: string;
  styles?: { input?: CSSProperties };
}

export function SortablePill({
  id,
  label,
  onRemove,
  containerId,
  style,
  size,
}: {
  id: string;
  label: string;
  onRemove?: () => void;
  containerId?: string;
  style?: CSSProperties;
  size?: MantineSize;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { containerId },
    strategy: horizontalListSortingStrategy,
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties;

  const combinedStyle = {
    ...sortableStyle,
    ...style,
  };

  return (
    <Pill
      size={size}
      ref={setNodeRef}
      className={cx(S.pill, { [S.dragging]: isDragging })}
      withRemoveButton
      onRemove={onRemove}
      data-reorderable-pill="true"
      data-containter-id={containerId}
      {...attributes}
      {...listeners}
      style={combinedStyle}
      styles={{
        label: {
          display: "flex",
          alignItems: "center",
        },
        remove: {
          marginRight: 0,
        },
      }}
      radius="xl"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
      }}
    >
      {label}
    </Pill>
  );
}

export function ReorderableTagsInput({
  data,
  value,
  onChange,
  maxValues,
  placeholder,
  size = "xs",
  containerId,
  useExternalDnd = false,
  draggedItemId,
  currentDroppable,
  "data-testid": dataTestId,
  styles,
}: Props) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const draggingRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [search, setSearch] = useState("");

  // Make the container droppable when using external DnD
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: containerId || "default",
    disabled: !useExternalDnd,
    data: { containerId },
  });

  const selectedSet = useMemo(() => new Set(value), [value]);
  const available = useMemo(
    () =>
      data
        .filter((o) => !selectedSet.has(o.value))
        .filter(
          (o) =>
            o.label.toLowerCase().includes(search.toLowerCase()) ||
            o.value.toLowerCase().includes(search.toLowerCase()),
        ),
    [data, selectedSet, search],
  );

  const addValue = (val: string) => {
    if (selectedSet.has(val)) {
      return;
    }
    if (maxValues && value.length >= maxValues) {
      return;
    }
    onChange([...value, val]);
    setSearch("");
  };

  const removeAt = (idx: number) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = value.indexOf(String(active.id));
    const newIndex = value.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onChange(arrayMove(value, oldIndex, newIndex));
  };

  const renderPillsInput = () => (
    <Combobox.DropdownTarget>
      <PillsInput
        ref={useExternalDnd ? setDroppableRef : undefined}
        radius="xl"
        size={size}
        classNames={{
          input: cx(S.pillsRow, {
            [S.max]: maxValues && value.length >= maxValues,
            [S.dragOver]: isDragOver || currentDroppable === containerId,
          }),
        }}
        styles={styles}
        onMouseDownCapture={(e: React.MouseEvent<HTMLDivElement>) => {
          const target = e.target as HTMLElement;
          // Do not open when interacting with a pill (likely starting a drag or clicking remove)
          if (
            target?.closest('[data-reorderable-pill="true"]') ||
            (maxValues && value.length >= maxValues)
          ) {
            e.nativeEvent.stopImmediatePropagation();
            return;
          }
          combobox.openDropdown();
        }}
        onDragOver={(e) => {
          // Allow dropping external items
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragEnter={(e) => {
          const related = e.relatedTarget as Node | null;
          // Only set drag-over when entering from outside the top-level container
          if (related && e.currentTarget.contains(related)) {
            return;
          }
          draggingRef.current = true;
          // Highlight the input when an external draggable is over it
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          const related = e.relatedTarget as Node | null;
          // Only clear drag-over when leaving to outside the top-level container
          if (related && e.currentTarget.contains(related)) {
            return;
          }
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = e.dataTransfer.getData("text/plain");
          if (!val) {
            return;
          }
          if (maxValues && value.length >= maxValues) {
            return;
          }
          if (selectedSet.has(val)) {
            return;
          }
          addValue(val);
          setIsDragOver(false);
        }}
      >
        {value.map((v, idx) => {
          // Hide the dragged item if it's being dragged over a different container
          const shouldHide =
            useExternalDnd &&
            draggedItemId === v &&
            currentDroppable &&
            currentDroppable !== containerId;

          return (
            <SortablePill
              size={size}
              key={v}
              id={v}
              label={data.find((o) => o.value === v)?.label ?? v}
              onRemove={() => removeAt(idx)}
              containerId={containerId}
              style={{
                display: shouldHide ? "none" : "flex",
              }}
            />
          );
        })}
        {!maxValues || value.length < maxValues ? (
          <Combobox.EventsTarget>
            <PillsInput.Field
              className={S.inputField}
              placeholder={value.length ? undefined : placeholder}
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setSearch(e.currentTarget.value);
                if (!maxValues || value.length < maxValues) {
                  combobox.openDropdown();
                }
              }}
              onFocus={() => {
                if (!maxValues || value.length < maxValues) {
                  combobox.openDropdown();
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Backspace" &&
                  search.length === 0 &&
                  value.length > 0
                ) {
                  event.preventDefault();
                  removeAt(value.length - 1);
                }
              }}
              style={styles?.input}
            />
          </Combobox.EventsTarget>
        ) : null}
      </PillsInput>
    </Combobox.DropdownTarget>
  );

  return (
    <Combobox
      data-testid={dataTestId}
      store={combobox}
      withinPortal={true}
      onOptionSubmit={(val) => {
        addValue(val);
        if (maxValues && value.length === maxValues - 1) {
          combobox.closeDropdown();
        }
      }}
    >
      {useExternalDnd ? (
        <SortableContext items={value} strategy={horizontalListSortingStrategy}>
          {renderPillsInput()}
        </SortableContext>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            // mark dragging to avoid opening dropdown due to click/mousedown bubbling
            draggingRef.current = true;
          }}
          onDragEnd={(event) => {
            onDragEnd(event);
            // reset dragging flag on next tick to avoid immediate click opening
            setTimeout(() => {
              draggingRef.current = false;
            }, 0);
          }}
        >
          <SortableContext
            items={value}
            strategy={horizontalListSortingStrategy}
          >
            {renderPillsInput()}
          </SortableContext>
        </DndContext>
      )}

      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={256} type="auto">
            {available.length === 0 ? (
              <Combobox.Empty>{t`Nothing found`}</Combobox.Empty>
            ) : (
              available.map((opt) => (
                <Combobox.Option value={opt.value} key={opt.value}>
                  {opt.label}
                </Combobox.Option>
              ))
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
