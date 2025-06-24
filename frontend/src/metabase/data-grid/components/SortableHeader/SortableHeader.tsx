import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Header } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";
import { type CSSProperties, memo, useCallback, useMemo, useRef } from "react";

import S from "./SortableHeader.module.css";

// if header is dragged fewer than than this number of pixels we consider it a click instead of a drag
const HEADER_DRAG_THRESHOLD = 8;

type DragPosition = { x: number; y: number };

export interface SortableHeaderProps<TData, TValue> {
  children: React.ReactNode;
  className?: string;
  isColumnReorderingDisabled?: boolean;
  style?: React.CSSProperties;
  header: Header<TData, TValue>;
  onClick?: (e: React.MouseEvent<HTMLDivElement>, columnId: string) => void;
}

export const SortableHeader = memo(function SortableHeader<TData, TValue>({
  header,
  className,
  children,
  isColumnReorderingDisabled,
  style: styleProp,
  onClick,
}: SortableHeaderProps<TData, TValue>) {
  const isPinned = header.column.getIsPinned();
  const canResize = header.column.columnDef.enableResizing;
  const headerClickTargetSelector =
    header.column.columnDef.meta?.headerClickTargetSelector;

  const id = header.column.id;
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id,
      disabled: isColumnReorderingDisabled || !!isPinned,
    });

  const dragStartPosition = useRef<DragPosition | null>(null);

  const rootStyle = useMemo<CSSProperties>(() => {
    if (isPinned) {
      return styleProp ?? {};
    }
    return {
      position: "relative",
      transform: isDragging ? CSS.Translate.toString(transform) : undefined,
      transition: "width transform 0.2s ease-in-out",
      whiteSpace: "nowrap",
      zIndex: isDragging ? 2 : 0,
      cursor: isDragging ? "grabbing" : "pointer",
      outline: "none",
      ...styleProp,
    };
  }, [isDragging, transform, isPinned, styleProp]);

  const nodeAttributes = useMemo(() => {
    if (isPinned) {
      return {};
    }

    return {
      ...listeners,
      ...attributes,
    };
  }, [attributes, isPinned, listeners]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragStartPosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleDragEnd = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragStartPosition.current) {
        const dx = Math.abs(e.clientX - dragStartPosition.current.x);
        const dy = Math.abs(e.clientY - dragStartPosition.current.y);

        const isClicked = dx + dy < HEADER_DRAG_THRESHOLD;
        const isClickTarget = headerClickTargetSelector
          ? !!(e.target as HTMLElement).closest(headerClickTargetSelector)
          : true;
        if (isClicked && onClick && isClickTarget) {
          onClick(e, id);
        }

        dragStartPosition.current = null;
      }
    },
    [id, onClick, headerClickTargetSelector],
  );

  const resizeHandler = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      header.getResizeHandler()(e);
      e.stopPropagation();
    },
    [header],
  );

  return (
    <div
      ref={setNodeRef}
      className={cx(S.root, className)}
      style={rootStyle}
      onMouseDown={handleDragStart}
      onMouseUp={handleDragEnd}
    >
      <div className={S.headerContent} {...nodeAttributes}>
        {children}
      </div>
      {canResize ? (
        <div
          data-testid={`resize-handle-${id}`}
          className={S.resizeHandle}
          onMouseDown={resizeHandler}
          onTouchStart={resizeHandler}
          onMouseOver={(e) => e.stopPropagation()}
        />
      ) : null}
    </div>
  );
}) as <TData, TValue>(
  props: SortableHeaderProps<TData, TValue>,
) => React.ReactElement;
