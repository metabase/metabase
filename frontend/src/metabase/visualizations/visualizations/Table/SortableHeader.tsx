import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Header } from "@tanstack/react-table";
import type React from "react";
import { type CSSProperties, memo, useCallback, useRef } from "react";

import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import CS from "metabase/css/core/index.css";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn, DatasetData, RowValues } from "metabase-types/api";

import S from "./Table.module.css";

export interface SortableHeaderProps {
  id: string;
  canSort?: boolean;
  column: DatasetColumn;
  question: Question;
  hasMetadataPopovers: boolean;
  data: DatasetData;
  children: React.ReactNode;
  header: Header<RowValues, unknown>;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

// if header is dragged fewer than than this number of pixels we consider it a click instead of a drag
const HEADER_DRAG_THRESHOLD = 5;

type DragPosition = { x: number; y: number };

export const SortableHeader = memo(function SortableHeader({
  id,
  canSort,
  onClick,
  column,
  question,
  hasMetadataPopovers,
  data,
  header,
  children,
}: SortableHeaderProps) {
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
          onClick(e);
        }

        dragStartPosition.current = null;
      }
    },
    [onClick],
  );

  const resizeHandler: (e: React.MouseEvent | React.TouchEvent) => void =
    useCallback(
      e => {
        e.preventDefault();
        e.stopPropagation();
        header.getResizeHandler()(e);
      },
      [header],
    );

  const query = question?.query();
  const stageIndex = -1;

  return (
    <div className={S.th} style={style}>
      <div
        ref={setNodeRef}
        className={S.headerWrapper}
        onMouseDown={handleDragStart}
        onMouseUp={handleDragEnd}
      >
        <div className={S.headerWrapper} {...attributes} {...listeners}>
          <QueryColumnInfoPopover
            position="bottom-start"
            query={query}
            stageIndex={-1}
            column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
            timezone={data.results_timezone}
            disabled={!hasMetadataPopovers || isDragging}
            openDelay={500}
            showFingerprintInfo
          >
            {children}
          </QueryColumnInfoPopover>
        </div>
      </div>
      <div
        className={S.resizer}
        onMouseDown={resizeHandler}
        onTouchStart={resizeHandler}
      />
    </div>
  );
});
