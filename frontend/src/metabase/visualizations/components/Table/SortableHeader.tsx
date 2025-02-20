import cx from "classnames";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Header } from "@tanstack/react-table";
import type React from "react";
import { type CSSProperties, memo, useMemo, useRef, useCallback } from "react";

import S from "./SortableHeader.module.css";

export interface SortableHeaderProps<TData, TValue> {
  children: React.ReactNode;
  className?: string;
  header: Header<TData, TValue>;
}

const DRAG_THRESHOLD = 8;

type DragPosition = { x: number; y: number };

export const SortableHeader = memo(function SortableHeader<TData, TValue>({
  header,
  className,
  children,
}: SortableHeaderProps<TData, TValue>) {
  const canSort = header.column.columnDef.meta?.enableReordering;
  const canResize = header.column.columnDef.enableResizing;
  const table = header.getContext().table;
  const isResizingCurrentColumn =
    table.getState().columnSizingInfo.isResizingColumn === header.column.id;

  const id = header.column.id;
  const dragStartPosition = useRef<DragPosition | null>(null);
  const isDraggingRef = useRef(false);

  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id,
      disabled: !canSort,
    });

  const style = useMemo<CSSProperties>(() => {
    if (!canSort) {
      return {};
    }
    return {
      position: "relative",
      transform: isDragging ? CSS.Translate.toString(transform) : undefined,
      transition: "width transform 0.2s ease-in-out",
      whiteSpace: "nowrap",
      zIndex: isDragging ? 2 : 0,
      cursor: isDragging ? "grabbing" : "pointer",
      outline: "none",
    };
  }, [isDragging, transform, canSort]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragStartPosition.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  }, []);

  const handleDragMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStartPosition.current || !canSort) {
        return;
      }

      const dx = Math.abs(e.clientX - dragStartPosition.current.x);
      const dy = Math.abs(e.clientY - dragStartPosition.current.y);

      if (!isDraggingRef.current && dx + dy >= DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        // trigger sorting mousedown when we detect a drag
        listeners?.onMouseDown?.(e);
      }
    },
    [canSort, listeners],
  );

  const handleDragEnd = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // only trigger sortable mouseup if we were dragging
      if (isDraggingRef.current) {
        listeners?.onMouseUp?.(e);
      }
      dragStartPosition.current = null;
      isDraggingRef.current = false;
    },
    [listeners],
  );

  const nodeAttributes = useMemo(() => {
    if (!canSort) {
      return {};
    }

    const { onMouseDown, onMouseMove, onMouseUp, ...restListeners } =
      listeners ?? {};

    return {
      ...attributes,
      ...restListeners,
      onMouseDown: handleDragStart,
      onMouseMove: handleDragMove,
      onMouseUp: handleDragEnd,
      onMouseLeave: handleDragEnd,
    };
  }, [
    attributes,
    canSort,
    listeners,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  ]);

  const resizeHandler = (e: React.MouseEvent | React.TouchEvent) => {
    header.getResizeHandler()(e);
    e.stopPropagation();
  };

  return (
    <div
      ref={setNodeRef}
      className={cx(S.root, className, {
        [S.bordered]: isResizingCurrentColumn,
      })}
      style={style}
    >
      <div className={S.headerContent} {...nodeAttributes}>
        {children}
      </div>
      {canResize ? (
        <div
          className={S.resizeHandle}
          onMouseDown={resizeHandler}
          onTouchStart={resizeHandler}
          onMouseOver={e => e.stopPropagation()}
        />
      ) : null}
    </div>
  );
}) as <TData, TValue>(
  props: SortableHeaderProps<TData, TValue>,
) => React.ReactElement;
