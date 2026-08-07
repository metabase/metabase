import {
  DndContext,
  type DndContextProps,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMergedRef } from "@mantine/hooks";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { useDndSensors } from "metabase/common/hooks";
import { Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../NotebookCell";

import { ClausePopover } from "./ClausePopover";
import S from "./ClauseStep.module.css";

type RenderItemOpts<T> = {
  item: T;
  index: number;
  onOpen?: () => void;
  hasPopover?: boolean;
};

type RenderPopoverOpts<T> = {
  item?: T;
  index?: number;
  onClose: () => void;
};

/**
 * Static clauses are display-only. Inspectable clauses still open their
 * read-only popover so people can examine values without mutation controls.
 */
type ClauseStepReadOnlyMode = "static" | "inspectable";

type ClauseStepBaseProps<T> = {
  color: ColorName;
  items: T[];
  initialAddText?: string;
  isLastOpened?: boolean;
  hasAddButton?: boolean;
  isAddButtonDisabled?: boolean;
  hasRemoveButton?: boolean;
  readOnly?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (opts: RenderPopoverOpts<T>) => JSX.Element | null;
  "data-testid"?: string;
};

export type ClauseStepProps<T> = ClauseStepBaseProps<T> & {
  onRemove: (item: T, index: number) => void;
  onReorder: (sourceItem: T, targetItem: T) => void;
};

export type ReadOnlyClauseStepProps<T> = Omit<
  ClauseStepBaseProps<T>,
  | "hasAddButton"
  | "hasRemoveButton"
  | "initialAddText"
  | "isAddButtonDisabled"
  | "isLastOpened"
  | "readOnly"
> & {
  mode?: ClauseStepReadOnlyMode;
};

type ClauseStepContentProps<T> = ClauseStepBaseProps<T> & {
  readOnlyMode?: ClauseStepReadOnlyMode;
  onRemove?: ClauseStepProps<T>["onRemove"];
  onReorder?: ClauseStepProps<T>["onReorder"];
};

export const ClauseStep = <T,>(props: ClauseStepProps<T>) => (
  <ClauseStepContent {...props} />
);

export const ReadOnlyClauseStep = <T,>({
  mode = "static",
  ...props
}: ReadOnlyClauseStepProps<T>) => (
  <ClauseStepContent {...props} readOnly readOnlyMode={mode} />
);

const ClauseStepContent = <T,>({
  color,
  items,
  initialAddText,
  readOnly = false,
  readOnlyMode = "static",
  isLastOpened = false,
  hasAddButton = !readOnly,
  isAddButtonDisabled = false,
  hasRemoveButton = !readOnly,
  renderName,
  renderPopover,
  onRemove,
  onReorder,
  ...props
}: ClauseStepContentProps<T>): JSX.Element => {
  const renderItem = ({
    item,
    index,
    onOpen,
    hasPopover,
  }: RenderItemOpts<T>) => (
    <ClauseStepDndItem index={index} readOnly={readOnly}>
      <NotebookCellItem
        color={color}
        readOnly={readOnly}
        onClick={onOpen}
        hasPopover={hasPopover}
      >
        {renderName(item, index)}
        {hasRemoveButton && (
          <Icon
            className={S.closeIcon}
            name="close"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(item, index);
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
      disabled={isAddButtonDisabled}
      onClick={onOpen}
    />
  );

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      <ClauseStepDndContext items={items} onReorder={onReorder}>
        {items.map((item, index) => (
          <ClausePopover
            key={index}
            disabled={readOnly && readOnlyMode === "static"}
            renderItem={(onOpen, hasPopover) =>
              renderItem({ item, index, onOpen, hasPopover })
            }
            renderPopover={(onClose) => renderPopover({ item, index, onClose })}
          />
        ))}
      </ClauseStepDndContext>
      {hasAddButton && (
        <ClausePopover
          isInitiallyOpen={isLastOpened}
          renderItem={(onOpen) => renderNewItem({ onOpen })}
          renderPopover={(onClose) => renderPopover({ onClose })}
        />
      )}
    </NotebookCell>
  );
};

type ClauseStepDndContextProps<T> = {
  items: T[];
  children: ReactNode;
  onReorder?: (sourceItem: T, targetItem: T) => void;
};

function ClauseStepDndContext<T>({
  items,
  children,
  onReorder,
}: ClauseStepDndContextProps<T>) {
  const sensors = useDndSensors({ distance: 15 });

  const handleSortEnd: DndContextProps["onDragEnd"] = useCallback(
    (input: DragEndEvent) => {
      if (input.over && onReorder) {
        const sourceIndex = getItemIndexFromId(input.active.id);
        const targetIndex = getItemIndexFromId(input.over.id);
        onReorder(items[sourceIndex], items[targetIndex]);
      }
    },
    [items, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
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
