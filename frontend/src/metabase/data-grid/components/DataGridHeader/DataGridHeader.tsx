import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Column, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import cx from "classnames";
import type React from "react";

import {
  HEADER_HEIGHT,
  PINNED_BORDER_SEPARATOR_WIDTH,
  PINNED_COLUMN_Z_INDEX,
  ROW_ID_COLUMN_ID,
} from "../../constants";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";
import { SortableHeader } from "../SortableHeader/SortableHeader";

export interface DataGridHeaderProps<TData> extends DataGridStylesProps {
  table: Table<TData>;
  virtualColumns: VirtualItem[];
  virtualPaddingLeft: number | undefined;
  virtualPaddingRight: number | undefined;
  lastPinnedColumn: Column<TData> | undefined;
  isLastPinnedColumnRowId: boolean;
  stickyElementsBackgroundColor: string;
  backgroundColor: string | undefined;
  isAddColumnButtonSticky: boolean;
  addColumnButton: React.ReactNode;
  isColumnReorderingDisabled?: boolean;
  onHeaderCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    columnId?: string,
  ) => void;
}

export const DataGridHeader = <TData,>({
  table,
  virtualColumns,
  virtualPaddingLeft,
  virtualPaddingRight,
  lastPinnedColumn,
  isLastPinnedColumnRowId,
  stickyElementsBackgroundColor,
  backgroundColor,
  isAddColumnButtonSticky,
  addColumnButton,
  isColumnReorderingDisabled,
  onHeaderCellClick,
  classNames,
  styles,
}: DataGridHeaderProps<TData>) => (
  <div
    data-testid="table-header"
    className={cx(S.headerContainer, classNames?.headerContainer)}
    style={{
      backgroundColor: stickyElementsBackgroundColor,
      ...styles?.headerContainer,
    }}
  >
    {table.getHeaderGroups().map((headerGroup) => (
      <div
        key={headerGroup.id}
        className={cx(S.row, classNames?.row)}
        style={{
          height: `${HEADER_HEIGHT}px`,
          backgroundColor,
          ...styles?.row,
        }}
      >
        {virtualPaddingLeft ? (
          <div style={{ width: virtualPaddingLeft }} />
        ) : null}
        <SortableContext
          items={table.getState().columnOrder}
          strategy={horizontalListSortingStrategy}
        >
          {virtualColumns.map((virtualColumn) => {
            const header = headerGroup.headers[virtualColumn.index];
            const headerCell = flexRender(
              header.column.columnDef.header,
              header.getContext(),
            );
            const width = header.column.getSize();
            const isPinned = header.column.getIsPinned();
            const isLastPinned = header.column.id === lastPinnedColumn?.id;
            const hasSeparator = isLastPinned && !isLastPinnedColumnRowId;
            const isRowIdColumn = header.column.id === ROW_ID_COLUMN_ID;
            const totalWidth = hasSeparator
              ? width + PINNED_BORDER_SEPARATOR_WIDTH
              : width;
            const style: React.CSSProperties = isPinned
              ? {
                  width: totalWidth,
                  position: "sticky",
                  left: `${virtualColumn.start}px`,
                  zIndex: PINNED_COLUMN_Z_INDEX,
                  backgroundColor: stickyElementsBackgroundColor,
                }
              : {
                  width: totalWidth,
                };

            const headerContent = isRowIdColumn ? (
              headerCell
            ) : (
              <SortableHeader
                className={cx(S.headerCell, classNames?.headerCell)}
                style={{
                  backgroundColor: stickyElementsBackgroundColor,
                  ...styles?.headerCell,
                }}
                isColumnReorderingDisabled={
                  isColumnReorderingDisabled || isRowIdColumn
                }
                header={header}
                onClick={onHeaderCellClick}
              >
                {headerCell}
              </SortableHeader>
            );

            return (
              <div
                key={header.id}
                style={style}
                className={cx({
                  [S.cellWithRightSeparator]: hasSeparator,
                })}
                data-header-id={header.id}
              >
                {headerContent}
              </div>
            );
          })}
        </SortableContext>
        {!isAddColumnButtonSticky ? addColumnButton : null}
        {virtualPaddingRight ? (
          <div style={{ width: virtualPaddingRight }} />
        ) : null}
      </div>
    ))}
  </div>
);
