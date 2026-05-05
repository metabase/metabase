import cx from "classnames";

import type { SortDirection } from "metabase-types/api";

import { type BaseRow, Table, type TableProps } from "./Table";
import TableS from "./Table.module.css";
import { useTableSorting } from "./useTableSorting";

export type ClientSortableTableProps<T extends BaseRow> = TableProps<T> & {
  formatValueForSorting?: (row: T, columnName: string) => any;
  defaultSortColumn?: string;
  defaultSortDirection?: SortDirection;
  className?: string;
};

/**
 * A basic reusable table component that supports client-side sorting by a column
 */
export function ClientSortableTable<Row extends BaseRow>({
  className,
  columns,
  rows,
  rowRenderer,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  defaultSortColumn,
  defaultSortDirection,
  ...rest
}: ClientSortableTableProps<Row>) {
  const {
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
    sortedRows,
  } = useTableSorting({
    rows,
    defaultSortColumn,
    formatValueForSorting,
  });

  return (
    <Table
      className={cx(className, TableS.Table)}
      rows={sortedRows}
      columns={columns}
      rowRenderer={rowRenderer}
      onSort={(name, direction) => {
        setSortColumn(name);
        setSortDirection(direction);
      }}
      sortColumnName={sortColumn}
      sortDirection={sortDirection}
      {...rest}
    />
  );
}
