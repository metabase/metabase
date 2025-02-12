import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Header } from "@tanstack/react-table";
import type React from "react";
import { type CSSProperties, memo, useCallback, useRef } from "react";

import S from "./SortableHeader.module.css";

export interface SortableHeaderProps<TData, TValue> {
  children: React.ReactNode;
  header: Header<TData, TValue>;
  renderHeaderDecorator?: (
    columnId: string,
    isDragging: boolean,
    children: React.ReactNode,
  ) => React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>, columnId: string) => void;
  isResizing?: boolean;
}

// if header is dragged fewer than than this number of pixels we consider it a click instead of a drag
const HEADER_DRAG_THRESHOLD = 8;

type DragPosition = { x: number; y: number };

export const SortableHeader = memo(function SortableHeader<TData, TValue>({
  header,
  children,
  renderHeaderDecorator,
  onClick,
  isResizing,
}: SortableHeaderProps<TData, TValue>) {
  const canSort = header.column.columnDef.meta?.enableReordering;
  const id = header.column.id;
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id,
      disabled: !canSort,
    });

  const dragStartPosition = useRef<DragPosition | null>(null);

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    transition: "width transform 0.2s ease-in-out",
    whiteSpace: "nowrap",
    zIndex: isDragging ? 2 : 0,
    cursor: canSort ? "grab" : "default",
    outline: "none",
  };

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragStartPosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleDragEnd = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragStartPosition.current) {
        const dx = Math.abs(e.clientX - dragStartPosition.current.x);
        const dy = Math.abs(e.clientY - dragStartPosition.current.y);

        const isClicked = dx + dy < HEADER_DRAG_THRESHOLD;

        if (isClicked && onClick) {
          onClick(e, id);
        }

        dragStartPosition.current = null;
      }
    },
    [id, onClick],
  );

  const resizeHandler: (e: React.MouseEvent | React.TouchEvent) => void =
    useCallback(
      e => {
        header.getResizeHandler()(e);
      },
      [header],
    );

  return (
    <div
      ref={setNodeRef}
      className={S.headerCell}
      style={style}
      onMouseDown={handleDragStart}
      onMouseUp={handleDragEnd}
    >
      <div className={S.headerContent} {...attributes} {...listeners}>
        {!renderHeaderDecorator
          ? children
          : renderHeaderDecorator(
              id,
              Boolean(isDragging || isResizing),
              children,
            )}
      </div>
      <div
        className={S.resizeHandle}
        onMouseDown={resizeHandler}
        onTouchStart={resizeHandler}
        onMouseOver={e => e.stopPropagation()}
      />
    </div>
  );
});
