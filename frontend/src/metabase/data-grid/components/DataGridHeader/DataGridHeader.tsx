import { type HeaderGroup, flexRender } from "@tanstack/react-table";
import cx from "classnames";
import type React from "react";

import { getColumnPositionStyles } from "metabase/data-grid/utils/stylings";

import { HEADER_HEIGHT } from "../../constants";
import type { DataGridColumnType } from "../../types";
import S from "../DataGrid/DataGrid.module.css";
import type { DataGridStylesProps } from "../DataGrid/types";
import { SortableHeader } from "../SortableHeader/SortableHeader";

export interface DataGridHeaderProps<TData> extends DataGridStylesProps {
  headerGroup: HeaderGroup<TData>;
  columns: DataGridColumnType<TData>[];
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
      const isUtilityColumn =
        header.column.columnDef.meta?.isUtilityColumn === true;
      const columnPositionStyles = getColumnPositionStyles(column);

      const headerContent = isUtilityColumn ? (
        headerCell
      ) : (
        <SortableHeader
          className={cx(S.headerCell, classNames?.headerCell)}
          style={styles?.headerCell}
          isColumnReorderingDisabled={isColumnReorderingDisabled}
          header={header}
          onClick={onHeaderCellClick}
        >
          {headerCell}
        </SortableHeader>
      );

      return (
        <div
          key={header.id}
          style={columnPositionStyles}
          data-header-id={header.id}
        >
          {headerContent}
        </div>
      );
    })}
  </div>
);
