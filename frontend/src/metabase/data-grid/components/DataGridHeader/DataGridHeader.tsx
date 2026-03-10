import { flexRender } from "@tanstack/react-table";
import type { HeaderGroup } from "@tanstack/table-core/src/types";
import cx from "classnames";
import type React from "react";

import { HEADER_HEIGHT, ROW_ID_COLUMN_ID } from "../../constants";
import type { DataGridColumn } from "../../types";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";
import { SortableHeader } from "../SortableHeader/SortableHeader";

export interface DataGridHeaderProps<TData> extends DataGridStylesProps {
  headerGroup: HeaderGroup<TData>;
  columns: DataGridColumn<TData>[];
  isColumnReorderingDisabled?: boolean;
  onHeaderCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    columnId?: string,
  ) => void;
}

export const DataGridHeader = <TData,>({
  headerGroup,
  columns,
  isColumnReorderingDisabled,
  onHeaderCellClick,
  classNames,
  styles,
}: DataGridHeaderProps<TData>) => (
  <div
    className={cx(S.row, classNames?.row)}
    style={{
      height: `${HEADER_HEIGHT}px`,
      ...styles?.row,
    }}
  >
    {columns.map((column) => {
      const header = headerGroup.headers[column.origin.getIndex()];
      const headerCell = flexRender(
        header.column.columnDef.header,
        header.getContext(),
      );
      const width = header.column.getSize();
      const isRowIdColumn = header.column.id === ROW_ID_COLUMN_ID;
      const style: React.CSSProperties = column.virtualItem
        ? {
            position: "absolute",
            left: column.virtualItem.start,
            width,
            top: 0,
            bottom: 0,
          }
        : { width };

      const headerContent = isRowIdColumn ? (
        headerCell
      ) : (
        <SortableHeader
          className={cx(S.headerCell, classNames?.headerCell)}
          style={styles?.headerCell}
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
        <div key={header.id} style={style} data-header-id={header.id}>
          {headerContent}
        </div>
      );
    })}
  </div>
);
