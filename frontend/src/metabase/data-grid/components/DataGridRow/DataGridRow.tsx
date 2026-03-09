import type { Column, Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import cx from "classnames";
import type React from "react";

import { hasModifierKeys } from "metabase/common/utils/keyboard";

import {
  HEADER_BORDER_SIZE,
  HEADER_HEIGHT,
  PINNED_ROW_Z_INDEX,
} from "../../constants";
import { isVirtualColumn, isVirtualRow } from "../../guards";
import type { DataGridSelection, MaybeVirtualRow } from "../../types";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";

export interface DataGridRowProps<TData> extends DataGridStylesProps {
  maybeVirtualRow: MaybeVirtualRow<TData>;
  columns: Column<TData>[] | VirtualItem[];
  rowMeasureRef?: ((element: HTMLElement | null) => void) | undefined;
  virtualPaddingLeft?: number | undefined;
  virtualPaddingRight?: number | undefined;
  stickyElementsBackgroundColor: string;
  zoomedRowIndex: number | undefined;
  selection: DataGridSelection;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIndex: number,
    columnId: string,
  ) => void;
}

const getRowPositionStyles = <TData,>(
  row: Row<TData>,
  virtualRow: VirtualItem | undefined,
  stickyElementsBackgroundColor: string,
): React.CSSProperties => {
  if (!virtualRow) {
    return {};
  }
  const pinnedPosition = row.getIsPinned();
  if (pinnedPosition === "top") {
    return {
      position: "sticky",
      top: `${HEADER_HEIGHT + virtualRow.start + HEADER_BORDER_SIZE}px`,
      zIndex: PINNED_ROW_Z_INDEX,
      backgroundColor: stickyElementsBackgroundColor,
    };
  }
  return {
    position: "absolute",
    minHeight: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start}px)`,
  };
};

export const DataGridRow = <TData,>({
  maybeVirtualRow,
  rowMeasureRef,
  columns,
  virtualPaddingLeft,
  virtualPaddingRight,
  stickyElementsBackgroundColor,
  zoomedRowIndex,
  selection,
  onBodyCellClick,
  classNames,
  styles,
}: DataGridRowProps<TData>) => {
  const { row, virtualRow } = isVirtualRow(maybeVirtualRow)
    ? maybeVirtualRow
    : { row: maybeVirtualRow, virtualRow: undefined };

  const rowPositionStyles = getRowPositionStyles(
    row,
    virtualRow,
    stickyElementsBackgroundColor,
  );

  const dataIndex = virtualRow != null ? virtualRow.index : row.index;
  const active = zoomedRowIndex === dataIndex;

  return (
    <div
      role="row"
      key={row.id}
      ref={rowMeasureRef}
      data-dataset-index={row.index}
      data-index={dataIndex}
      data-allow-page-break-after="true"
      data-row-selected={row.getIsSelected()}
      className={cx(S.row, classNames?.row, {
        [S.active]: active,
      })}
      style={{
        ...rowPositionStyles,
        ...styles?.row,
      }}
    >
      {virtualPaddingLeft ? (
        <div
          className={cx(S.bodyCell, classNames?.bodyCell)}
          style={{
            width: virtualPaddingLeft,
            ...styles?.bodyCell,
          }}
        />
      ) : null}

      {columns.map((column) => {
        const cell = isVirtualColumn(column)
          ? row.getCenterVisibleCells()[column.index]
          : row.getLeftVisibleCells()[column.getIndex("left")];

        const columnDef = cell.column.columnDef;
        const isSelectable =
          selection.isEnabled && columnDef?.meta?.enableSelection;

        const style: React.CSSProperties = {
          width: cell.column.getSize(),
          ...styles?.bodyCell,
        };

        return (
          <div
            key={cell.id}
            aria-selected={selection.isCellSelected(cell)}
            data-column-id={cell.column.id}
            data-selectable-cell={isSelectable ? "" : undefined}
            className={cx(S.bodyCell, classNames?.bodyCell, {
              [S.focusedCell]: selection.isCellFocused(cell),
            })}
            onClick={(e) => {
              if (hasModifierKeys(e)) {
                return;
              }
              onBodyCellClick?.(e, cell.row.index, cell.column.id);
            }}
            onDoubleClick={() => selection.handlers.handleCellDoubleClick(cell)}
            onMouseDown={(e) => selection.handlers.handleCellMouseDown(e, cell)}
            onMouseUp={(e) => selection.handlers.handleCellMouseUp(e, cell)}
            onMouseOver={(e) => selection.handlers.handleCellMouseOver(e, cell)}
            style={style}
          >
            {flexRender(cell.column.columnDef.cell, {
              ...cell.getContext(),
              isSelected: selection.isCellSelected(cell),
            })}
          </div>
        );
      })}
      {virtualPaddingRight ? (
        <div
          className={cx(S.bodyCell, classNames?.bodyCell)}
          style={{
            width: virtualPaddingRight,
            ...styles?.bodyCell,
          }}
        />
      ) : null}
    </div>
  );
};
