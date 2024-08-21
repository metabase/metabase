import React, { useCallback, useMemo } from "react";

import {
  type BaseRow,
  ControlledTable,
  type ControlledTableProps,
} from "./ControlledTable";

const compareNumbers = (a: number, b: number) => a - b;

export type TableProps<T extends BaseRow> = ControlledTableProps<T> & {
  locale?: string;
  formatValueForSorting?: (row: T, columnName: string) => any;
};

/**
 * A basic reusable table component that supports client-side sorting by a column
 *
 * @param columns     - an array of objects with name and key properties
 * @param rows        - an array of objects with keys that match the column keys
 * @param rowRenderer - a function that takes a row object and returns a <tr> element
 * @param tableProps  - additional props to pass to the <table> element
 */
export function Table<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  tableProps,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  locale,
  ...rest
}: TableProps<Row>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "asc",
  );

  const compareStrings = useCallback(
    (a: string, b: string) =>
      a.localeCompare(b, locale, { sensitivity: "base" }),
    [locale],
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
            ? compareStrings(a, b as string)
            : compareNumbers(a, b as number);
        return sortDirection === "asc" ? result : -result;
      });
    }
    return rows;
  }, [rows, sortColumn, sortDirection, compareStrings, formatValueForSorting]);

  return (
    <ControlledTable
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

function isSortableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
