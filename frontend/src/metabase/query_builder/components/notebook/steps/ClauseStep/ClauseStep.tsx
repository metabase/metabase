import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { PointerSensor, useSensor, DndContext } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMergedRef } from "@mantine/hooks";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";

import { ClausePopover } from "./ClausePopover";

type RenderItemOpts<T> = {
  item: T;
  index: number;
  onOpen?: () => void;
};

type RenderPopoverOpts<T> = {
  item?: T;
  index?: number;
  onClose: () => void;
};

export type ClauseStepProps<T> = {
  color: string;
  items: T[];
  initialAddText?: string;
  readOnly?: boolean;
  isLastOpened?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (opts: RenderPopoverOpts<T>) => JSX.Element | null;
  onRemove: (item: T, index: number) => void;
  onReorder: (sourceItem: T, targetItem: T) => void;
  "data-testid"?: string;
};

export const ClauseStep = <T,>({
  color,
  items,
  initialAddText,
  readOnly = false,
  isLastOpened = false,
  renderName,
  renderPopover,
  onRemove,
  onReorder,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  const renderItem = ({ item, index, onOpen }: RenderItemOpts<T>) => (
    <ClauseStepDndItem index={index} readOnly={readOnly}>
      <NotebookCellItem color={color} readOnly={readOnly} onClick={onOpen}>
        {renderName(item, index)}
        {!readOnly && (
          <Icon
            className={CS.ml1}
            name="close"
            onClick={e => {
              e.stopPropagation();
              onRemove(item, index);
            }}
          />
        )}
      </NotebookCellItem>
    </ClauseStepDndItem>
  );

  const renderNewItem = ({ onOpen }: { onOpen?: () => void }) => (
    <NotebookCellAdd
      initialAddText={items.length === 0 && initialAddText}
      color={color}
      onClick={onOpen}
    />
  );

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      <ClauseStepDndContext items={items} onReorder={onReorder}>
        {items.map((item, index) => (
          <ClausePopover
            key={index}
            renderItem={onOpen => renderItem({ item, index, onOpen })}
            renderPopover={onClose => renderPopover({ item, index, onClose })}
          />
        ))}
      </ClauseStepDndContext>
      {!readOnly && (
        <ClausePopover
          isInitiallyOpen={isLastOpened}
          renderItem={onOpen => renderNewItem({ onOpen })}
          renderPopover={onClose => renderPopover({ onClose })}
        />
      )}
    </NotebookCell>
  );
};

type ClauseStepDndContextProps<T> = {
  items: T[];
  children: ReactNode;
  onReorder: (sourceItem: T, targetItem: T) => void;
};

function ClauseStepDndContext<T>({
  items,
  children,
  onReorder,
}: ClauseStepDndContextProps<T>) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortEnd: DndContextProps["onDragEnd"] = useCallback(
    (input: DragEndEvent) => {
      if (input.over) {
        const sourceIndex = getItemIndexFromId(input.active.id);
        const targetIndex = getItemIndexFromId(input.over.id);
        onReorder(items[sourceIndex], items[targetIndex]);
      }
    },
    [items, onReorder],
  );

  return (
    <DndContext
      sensors={[pointerSensor]}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleSortEnd}
    >
      <SortableContext
        items={items.map((_, index) => getItemIdFromIndex(index))}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

type ClauseStepDndItemProps = {
  index: number;
  readOnly: boolean;
  children: ReactNode;
};

const ClauseStepDndItem = forwardRef(function ClauseStepDndItem(
  { index, readOnly, children }: ClauseStepDndItemProps,
  ref: Ref<HTMLDivElement>,
) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: getItemIdFromIndex(index),
      disabled: readOnly,
      // disable animation after reordering because we don't have stable item ids
      animateLayoutChanges: () => false,
    });

  const mergedRef = useMergedRef(ref, setNodeRef);

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
    >
      {children}
    </div>
  );
});

// dnd-kit ignores `0` item, so we convert indexes to string `"0"`
function getItemIdFromIndex(index: number) {
  return String(index);
}

function getItemIndexFromId(id: string | number) {
  return Number(id);
}
