import type { SortDirection } from "metabase-types/api/sorting";

import { type BaseRow, Table, type TableProps } from "./Table";
import TableS from "./Table.module.css";
import { useTableSorting } from "./useTableSorting";

export type ClientSortableTableProps<T extends BaseRow> = TableProps<T> & {
  locale: string;
  formatValueForSorting?: (row: T, columnName: string) => any;
  defaultSortColumn?: string;
  defaultSortDirection?: SortDirection;
};

/**
 * A basic reusable table component that supports client-side sorting by a column
 *
 * @param columns     - an array of objects with name and key properties
 * @param rows        - an array of objects with keys that match the column keys
 * @param rowRenderer - a function that takes a row object and returns a <tr> element
 * @param tableProps  - additional props to pass to the <table> element
 */
export function ClientSortableTable<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  defaultSortColumn,
  defaultSortDirection,
  locale,
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
    locale,
  });

  return (
    <Table
      className={TableS.Table}
      rows={sortedRows}
      columns={columns}
      rowRenderer={rowRenderer}
      onSort={({ name, direction }) => {
        setSortColumn(name);
        setSortDirection(direction);
      }}
      sortColumn={
        sortColumn ? { name: sortColumn, direction: sortDirection } : undefined
      }
      {...rest}
    />
  );
}
