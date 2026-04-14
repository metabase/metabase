import { flexRender } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";

import { hasModifierKeys } from "metabase/common/utils/keyboard";

import type {
  DataGridColumnType,
  DataGridRowType,
  DataGridSelection,
} from "../../types";
import {
  getColumnPositionStyles,
  getRowPositionStyles,
} from "../../utils/stylings";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";

export interface DataGridRowProps<TData> extends DataGridStylesProps {
  row: DataGridRowType<TData>;
  columns: DataGridColumnType<TData>[];
  rowMeasureRef?: ((element: Element | null) => void) | undefined;
  zoomedRowIndex: number | undefined;
  pinnedRowsCount: number;
  selection: DataGridSelection;
  datasetIndexAttributeName: string;
  virtualIndexAttributeName: string;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIndex: number,
    columnId: string,
  ) => void;
}

export const DataGridRow = <TData,>({
  row,
  columns,
  rowMeasureRef,
  pinnedRowsCount,
  zoomedRowIndex,
  selection,
  datasetIndexAttributeName,
  virtualIndexAttributeName,
  onBodyCellClick,
  classNames,
  styles,
}: DataGridRowProps<TData>) => {
  const rowPositionStyles = getRowPositionStyles(row);
  const paddingLeft = columns[0]?.virtualItem?.start ?? 0;

  /**
   * we must render this div with a ref even if there are no columns.
   * Otherwise, Tanstack's virtualizer won't be able to measure the row.
   * As a result, row heights in the pinned and center column sections become unsynced.
   * An alternative solution would be to create a custom ResizeObserver to track both parts of the row,
   * but the current solution is sufficient for now.
   *
   * This is covered by test "renders center section rows when all columns are pinned"
   */
  return (
    <div
      role="row"
      ref={rowMeasureRef}
      {...{
        [datasetIndexAttributeName]: row.origin.index,
        [virtualIndexAttributeName]: row.virtualItem?.index,
      }}
      data-allow-page-break-after="true"
      data-row-selected={row.origin.getIsSelected()}
      className={cx(
        S.row,
        {
          [S.withSeparator]: row.origin.index === pinnedRowsCount - 1,
          [S.active]: zoomedRowIndex === row.origin.index,
        },
        classNames?.row,
      )}
      style={{ ...rowPositionStyles, paddingLeft, ...styles?.row }}
    >
      {columns.map((column) => {
        const cell = column.getCell(row.origin);
        const columnDef = column.origin.columnDef;
        const isSelectable =
          selection.isEnabled && columnDef?.meta?.enableSelection;

        const columnPositionStyles = getColumnPositionStyles(column);
        return (
          <div
            key={cell.id}
            role="gridcell"
            aria-selected={selection.isCellSelected(cell)}
            data-column-id={column.origin.id}
            data-selectable-cell={isSelectable ? "" : undefined}
            className={cx(S.bodyCell, classNames?.bodyCell, {
              [S.focusedCell]: selection.isCellFocused(cell),
            })}
            onClick={(e) => {
              if (hasModifierKeys(e)) {
                return;
              }
              onBodyCellClick?.(e, cell.row.index, column.origin.id);
            }}
            onDoubleClick={() => selection.handlers.handleCellDoubleClick(cell)}
            onMouseDown={(e) => selection.handlers.handleCellMouseDown(e, cell)}
            onMouseUp={(e) => selection.handlers.handleCellMouseUp(e, cell)}
            onMouseOver={(e) => selection.handlers.handleCellMouseOver(e, cell)}
            style={{ ...columnPositionStyles, ...styles?.bodyCell }}
          >
            {flexRender(columnDef.cell, {
              ...cell.getContext(),
              isSelected: selection.isCellSelected(cell),
            })}
          </div>
        );
      })}
    </div>
  );
};
