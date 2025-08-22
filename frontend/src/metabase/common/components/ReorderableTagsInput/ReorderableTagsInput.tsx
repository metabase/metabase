import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
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
  size?: string;
  miw?: string | number;
  maw?: string | number;
  "data-testid"?: string;
}

function SortablePill({
  id,
  label,
  onRemove,
}: {
  id: string;
  label: string;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, strategy: horizontalListSortingStrategy });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  } as CSSProperties;

  return (
    <Pill
      ref={setNodeRef}
      className={cx(S.pill, { [S.dragging]: isDragging })}
      withRemoveButton
      onRemove={onRemove}
      data-reorderable-pill="true"
      {...attributes}
      {...listeners}
      style={style}
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
  "data-testid": dataTestId,
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

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(val) => {
        addValue(val);
        if (maxValues && value.length === maxValues - 1) {
          combobox.closeDropdown();
        }
      }}
    >
      <Combobox.DropdownTarget>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            // mark dragging to avoid opening dropdown due to click/mousedown bubbling
            draggingRef.current = true;
            console.log("dragging", dataTestId);
          }}
          onDragEnd={(event) => {
            onDragEnd(event);
            // reset dragging flag on next tick to avoid immediate click opening
            setTimeout(() => {
              draggingRef.current = false;
            }, 0);
            console.log("dragend", dataTestId);
          }}
          onDragOver={() => {
            console.log("dragover", dataTestId);
          }}
        >
          <SortableContext
            items={value}
            strategy={horizontalListSortingStrategy}
          >
            <PillsInput
              radius="xl"
              size={size}
              classNames={{
                input: cx(S.pillsRow, {
                  [S.max]: maxValues && value.length >= maxValues,
                  [S.dragOver]: isDragOver,
                }),
                root: cx(S.container, {}),
              }}
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
                console.log("dragover-input", dataTestId);
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
                console.log("dragenter-input", dataTestId);
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                // Only clear drag-over when leaving to outside the top-level container
                if (related && e.currentTarget.contains(related)) {
                  return;
                }
                setIsDragOver(false);
                console.log("dragleave-input", dataTestId);
              }}
              onDrop={(e) => {
                debugger;
                e.preventDefault();
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
                console.log("drop-input", dataTestId);
              }}
            >
              {value.map((v, idx) => (
                <SortablePill
                  key={v}
                  id={v}
                  label={data.find((o) => o.value === v)?.label ?? v}
                  onRemove={() => removeAt(idx)}
                />
              ))}
              {!maxValues || value.length < maxValues ? (
                <Combobox.EventsTarget>
                  <PillsInput.Field
                    // disabled={draggingRef.current}
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
                  />
                </Combobox.EventsTarget>
              ) : null}
            </PillsInput>
          </SortableContext>
        </DndContext>
      </Combobox.DropdownTarget>

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
