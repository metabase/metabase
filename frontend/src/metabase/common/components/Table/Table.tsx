import type React from "react";
import {
  Fragment,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";

import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { Box, Flex, Icon } from "metabase/ui";

export type BaseRow = Record<string, any> & { id: number | string };

type ColumnItem = {
  name: string;
  key: string;
  sortable?: boolean;
};

export type TableProps<Row extends BaseRow> = {
  columns: ColumnItem[];
  rows: Row[];
  rowRenderer: (row: Row) => React.ReactNode;
  formatValueForSorting?: (row: Row, columnName: string) => any;
  defaultSortColumn?: string;
  defaultSortDirection?: "asc" | "desc";
  ifEmpty?: React.ReactNode;
} & React.HTMLAttributes<HTMLTableElement>;

/**
 * A basic reusable table component that supports client-side sorting by a column
 *
 * @param {object} props
 * @property columns - An array of objects with name and key properties
 * @property rows - An array of row objects, which at minimum need an id
 * @property rowRenderer - A function that takes a row object and returns a <tr> element
 * @property formatValueForSorting
 * @property defaultSortColumn
 * @property defaultSortDirection
 * @property ifEmpty - A component to render if the table is empty
 * @note All other props are passed to the <table> element
 */
export function Table<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  defaultSortColumn,
  defaultSortDirection = "asc",
  children,
  ifEmpty = null,
  ...tableProps
}: PropsWithChildren<TableProps<Row>>) {
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;

  const [sortColumn, setSortColumn] = useState<string | undefined>(
    defaultSortColumn,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    defaultSortDirection,
  );

  const compareStrings = useCallback(
    (a: string, b: string) =>
      a.localeCompare(b, localeCode, { sensitivity: "base" }),
    [localeCode],
  );
  const compareNumbers = useCallback(
    (a: number, b: number) => (a < b ? -1 : 1),
    [],
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
  }, [
    rows,
    sortColumn,
    sortDirection,
    formatValueForSorting,
    compareStrings,
    compareNumbers,
  ]);

  return (
    <table {...tableProps}>
      {children}
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column.key}>
              <ColumnHeader
                column={column}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={(columnKey: string, direction: "asc" | "desc") => {
                  setSortColumn(columnKey);
                  setSortDirection(direction);
                }}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.length
          ? sortedRows.map((row, index) => (
              <Fragment key={row.id ?? index}>{rowRenderer(row)}</Fragment>
            ))
          : ifEmpty}
      </tbody>
    </table>
  );
}

function ColumnHeader({
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: ColumnItem;
  sortColumn: string | undefined;
  sortDirection: "asc" | "desc";
  onSort: (column: string, direction: "asc" | "desc") => void;
}) {
  column.sortable ??= true;
  return (
    <Flex
      gap="sm"
      align="center"
      style={{ cursor: "pointer" }}
      onClick={() => {
        if (column.sortable) {
          onSort(
            String(column.key),
            sortColumn === column.key && sortDirection === "asc"
              ? "desc"
              : "asc",
          );
        }
      }}
    >
      {column.name}
      {
        column.name && column.key === sortColumn ? (
          <Icon
            name={sortDirection === "asc" ? "chevronup" : "chevrondown"}
            color={color("text-medium")}
            style={{ flexShrink: 0 }}
            size={8}
          />
        ) : (
          <Box w="8px" />
        ) // spacer to keep the header the same size regardless of sort status
      }
    </Flex>
  );
}

function isSortableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
