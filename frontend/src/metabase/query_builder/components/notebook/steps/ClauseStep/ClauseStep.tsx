import type { DndContextProps } from "@dnd-kit/core";
import { PointerSensor, useSensor, DndContext } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { rectSwappingStrategy, SortableContext } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { useCallback } from "react";

import { Sortable } from "metabase/core/components/Sortable";
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

export interface ClauseStepProps<T> {
  color: string;
  items: T[];
  isLastOpened?: boolean;
  initialAddText?: string | null;
  readOnly?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (opts: RenderPopoverOpts<T>) => JSX.Element | null;
  canRemove?: (item: T) => boolean;
  onRemove?: ((item: T, index: number) => void) | null;
  onSortEnd?: (oldIndex: number, newIndex: number) => void;
  "data-testid"?: string;
}

export const ClauseStep = <T,>({
  color,
  items,
  isLastOpened = false,
  initialAddText = null,
  readOnly,
  renderName,
  renderPopover,
  canRemove,
  onRemove = null,
  onSortEnd,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 0 },
  });

  const handleSortEnd: DndContextProps["onDragEnd"] = useCallback(
    input => {
      const oldIndex = getItemIndexFromId(input.active.id);
      const newIndex = getItemIndexFromId(input.over?.id);
      onSortEnd?.(oldIndex, newIndex);
    },
    [onSortEnd],
  );

  const renderSortContext = (children: ReactNode) => (
    <DndContext
      sensors={[pointerSensor]}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleSortEnd}
    >
      <SortableContext
        items={items.map((_, index) => getItemIdFromIndex(index))}
        strategy={rectSwappingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );

  const renderNewItem = ({ onOpen }: { onOpen?: () => void }) => (
    <NotebookCellAdd
      initialAddText={items.length === 0 && initialAddText}
      color={color}
      onClick={onOpen}
    />
  );

  const renderItem = ({ item, index, onOpen }: RenderItemOpts<T>) => (
    <NotebookCellItem color={color} readOnly={readOnly} onClick={onOpen}>
      {renderName(item, index)}
      {!readOnly && onRemove && (!canRemove || canRemove(item)) && (
        <Icon
          className="ml1"
          name="close"
          onClick={e => {
            e.stopPropagation();
            onRemove(item, index);
          }}
        />
      )}
    </NotebookCellItem>
  );

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {renderSortContext(
        items.map((item, index) => (
          <Sortable id={getItemIdFromIndex(index)} key={index}>
            <ClausePopover
              renderItem={onOpen => renderItem({ item, index, onOpen })}
              renderPopover={onClose => renderPopover({ item, index, onClose })}
            />
          </Sortable>
        )),
      )}
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

function getItemIdFromIndex(index: number) {
  return String(index);
}

function getItemIndexFromId(id?: string | number) {
  return Number(id);
}
