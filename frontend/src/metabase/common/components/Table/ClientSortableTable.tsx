import React, { useMemo } from "react";

import { SortDirection } from "metabase-types/api/sorting";

import { type BaseRow, Table, type TableProps } from "./Table";

const compareNumbers = (a: number, b: number) => a - b;

export type ClientSortableTableProps<T extends BaseRow> = TableProps<T> & {
  locale?: string;
  formatValueForSorting?: (row: T, columnName: string) => any;
};

/**
 * A basic reusable table component that supports client-side sorting by a column
 *
 * @param props.columns               - an array of objects with name and key properties
 * @param props.rows                  - an array of objects with keys that match the column keys
 * @param props.rowRenderer           - a function that takes a row object and returns a <tr> element
 * @param props.formatValueForSorting - a function that is passed the row and column and returns a value to be used for sorting. Defaults to row[column]
 * @param props.locale                - a locale used for string comparisons
 * @param props.emptyBody             - content to be displayed when the row count is 0
 * @param props.cols                  - a ReactNode that is inserted in the table element before <thead>. Useful for defining <colgroups> and <cols>
 */
export function ClientSortableTable<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  locale,
  ...rest
}: ClientSortableTableProps<Row>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(
    SortDirection.Asc,
  );

  const sortedRows = useMemo(() => {
    if (sortColumn) {
      return [...rows].sort((rowA, rowB) => {
        const a = formatValueForSorting(rowA, sortColumn);
        const b = formatValueForSorting(rowB, sortColumn);

        if (!isSortableValue(a) || !isSortableValue(b)) {
          return 0;
        }

        const result =
          typeof a === "string"
            ? compareStrings(a, b as string, locale)
            : compareNumbers(a, b as number);
        return sortDirection === SortDirection.Asc ? result : -result;
      });
    }
    return rows;
  }, [rows, sortColumn, sortDirection, locale, formatValueForSorting]);

  return (
    <Table
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

function isSortableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function compareStrings(a: string, b: string, locale?: string) {
  return a.localeCompare(b, locale, { sensitivity: "base" });
}
