import { flexRender } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";

import { hasModifierKeys } from "metabase/common/utils/keyboard";

import { isVirtualRow } from "../../guards";
import type {
  DataGridColumn,
  DataGridSelection,
  MaybeVirtualRow,
} from "../../types";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";

import { getColumnPositionStyles, getRowPositionStyles } from "./utils";

export interface DataGridRowProps<TData> extends DataGridStylesProps {
  row: MaybeVirtualRow<TData>;
  columns: DataGridColumn<TData>[];
  rowMeasureRef?: ((element: HTMLElement | null) => void) | undefined;
  stickyElementsBackgroundColor: string;
  zoomedRowIndex: number | undefined;
  selection: DataGridSelection;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIndex: number,
    columnId: string,
  ) => void;
}

export const DataGridRow = <TData,>({
  row: maybeVirtualRow,
  rowMeasureRef,
  columns,
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
      style={{ ...rowPositionStyles, ...styles?.row }}
    >
      {columns.map((column) => {
        const cell = column.getCell(row);
        const columnDef = column.origin.columnDef;
        const isSelectable =
          selection.isEnabled && columnDef?.meta?.enableSelection;

        const columnPositionStyles = getColumnPositionStyles(column);
        return (
          <div
            key={cell.id}
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
