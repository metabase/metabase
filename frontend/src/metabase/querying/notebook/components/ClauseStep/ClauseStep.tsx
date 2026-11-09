import {
  DndContext,
  type DndContextProps,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMergedRef } from "@mantine/hooks";
import type { JSX, ReactNode, Ref } from "react";
import { Fragment, forwardRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";

import { useDndSensors } from "metabase/common/hooks";
import { Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type * as Lib from "metabase-lib";

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

type OpenInlineEditor = (
  initialExpressionClause?: Lib.DefinedClauseName | null,
) => void;

type RenderPopoverOpts<T> = {
  item?: T;
  index?: number;
  onClose: () => void;
  openInlineEditor?: OpenInlineEditor;
};

type RenderInlineEditorOpts<T> = {
  item?: T;
  index?: number;
  initialExpressionClause: Lib.DefinedClauseName | null;
  onClose: () => void;
};

type InlineEditorTarget = {
  index?: number;
  initialExpressionClause: Lib.DefinedClauseName | null;
};

export type ClauseStepProps<T> = {
  color: ColorName;
  items: T[];
  initialAddText?: string;
  readOnly?: boolean;
  isLastOpened?: boolean;
  hasAddButton?: boolean;
  isAddButtonDisabled?: boolean;
  hasRemoveButton?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (opts: RenderPopoverOpts<T>) => JSX.Element | null;
  renderInlineEditor?: (opts: RenderInlineEditorOpts<T>) => JSX.Element | null;
  /** Whether the item, or the add button when `item` is undefined, skips the popover and opens the inline editor. */
  opensInlineEditor?: (item?: T) => boolean;
  /** Where to show the inline editor. Defaults to directly below the pill bar. */
  inlineEditorContainer?: HTMLElement | null;
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
  hasAddButton = !readOnly,
  isAddButtonDisabled = false,
  hasRemoveButton = !readOnly,
  renderName,
  renderPopover,
  renderInlineEditor,
  opensInlineEditor,
  inlineEditorContainer,
  onRemove,
  onReorder,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  const canOpenInline = (item?: T) =>
    !readOnly &&
    renderInlineEditor != null &&
    opensInlineEditor?.(item) === true;

  const [inlineEditor, setInlineEditor] = useState<InlineEditorTarget | null>(
    () =>
      isLastOpened && hasAddButton && canOpenInline()
        ? { initialExpressionClause: null }
        : null,
  );

  const closeInlineEditor = useCallback(() => setInlineEditor(null), []);

  const getOpenInlineEditor = (
    index: number | undefined,
    onClosePopover: () => void,
  ): OpenInlineEditor | undefined =>
    renderInlineEditor
      ? (initialExpressionClause = null) => {
          onClosePopover();
          setInlineEditor({ index, initialExpressionClause });
        }
      : undefined;

  const inlineItem =
    inlineEditor?.index != null ? items[inlineEditor.index] : undefined;
  const isInlineTargetMissing =
    inlineEditor?.index != null && inlineItem === undefined;
  const inlineEditorContent =
    inlineEditor && !isInlineTargetMissing
      ? (renderInlineEditor?.({
          item: inlineItem,
          index: inlineEditor.index,
          initialExpressionClause: inlineEditor.initialExpressionClause,
          onClose: closeInlineEditor,
        }) ?? null)
      : null;
  const inlineEditorBox = inlineEditor && inlineEditorContent && (
    <div
      key={`${inlineEditor.index ?? "new"}-${inlineEditor.initialExpressionClause ?? ""}`}
      className={S.inlineEditor}
    >
      {inlineEditorContent}
    </div>
  );

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
              closeInlineEditor();
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
      disabled={isAddButtonDisabled}
      onClick={onOpen}
    />
  );

  return (
    <>
      <NotebookCell color={color} data-testid={props["data-testid"]}>
        <ClauseStepDndContext
          items={items}
          onReorder={onReorder}
          onDragStart={closeInlineEditor}
        >
          {items.map((item, index) =>
            canOpenInline(item) ? (
              <Fragment key={index}>
                {renderItem({
                  item,
                  index,
                  hasPopover: true,
                  onOpen: () =>
                    setInlineEditor({ index, initialExpressionClause: null }),
                })}
              </Fragment>
            ) : (
              <ClausePopover
                key={index}
                disabled={readOnly}
                renderItem={(onOpen, hasPopover) =>
                  renderItem({ item, index, onOpen, hasPopover })
                }
                renderPopover={(onClose) =>
                  renderPopover({
                    item,
                    index,
                    onClose,
                    openInlineEditor: getOpenInlineEditor(index, onClose),
                  })
                }
              />
            ),
          )}
        </ClauseStepDndContext>
        {hasAddButton &&
          (canOpenInline() ? (
            renderNewItem({
              onOpen: () => setInlineEditor({ initialExpressionClause: null }),
            })
          ) : (
            <ClausePopover
              isInitiallyOpen={isLastOpened}
              renderItem={(onOpen) => renderNewItem({ onOpen })}
              renderPopover={(onClose) =>
                renderPopover({
                  onClose,
                  openInlineEditor: getOpenInlineEditor(undefined, onClose),
                })
              }
            />
          ))}
      </NotebookCell>
      {inlineEditorBox && inlineEditorContainer
        ? createPortal(inlineEditorBox, inlineEditorContainer)
        : inlineEditorBox}
    </>
  );
};

type ClauseStepDndContextProps<T> = {
  items: T[];
  children: ReactNode;
  onReorder: (sourceItem: T, targetItem: T) => void;
  onDragStart: () => void;
};

function ClauseStepDndContext<T>({
  items,
  children,
  onReorder,
  onDragStart,
}: ClauseStepDndContextProps<T>) {
  const sensors = useDndSensors({ distance: 15 });

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
      sensors={sensors}
      modifiers={[restrictToParentElement]}
      onDragStart={onDragStart}
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
