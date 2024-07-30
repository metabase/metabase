import type { PropsWithChildren, ReactNode } from "react";
import React from "react";

import { Box, Flex, Icon } from "metabase/ui";

import type { BaseRow, ColumnItem } from "./types";
import { useTableSorting } from "./useTableSorting";

export type TableProps<Row extends BaseRow> = {
  columns: ColumnItem[];
  rows: Row[];
  rowRenderer: (row: Row) => ReactNode;
  formatValueForSorting?: (row: Row, columnName: string) => any;
  defaultSortColumn?: string;
  defaultSortDirection?: "asc" | "desc";
  appendToBody?: ReactNode;
} & React.HTMLAttributes<HTMLTableElement>;

/**
 * A basic reusable table component that supports client-side sorting by a column
 *
 * @param props.columns - An array of objects with name and key properties
 * @param props.rows - An array of row objects, which at minimum need an id
 * @param props.rowRenderer - A function that takes a row object and returns a <tr> element
 * @param props.formatValueForSorting
 * @param props.defaultSortColumn
 * @param props.defaultSortDirection
 * @param props.appendToBody - Optional React node to append to the body of the table
 * @note All other props are passed to the <table> element
 */
export function Table<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  formatValueForSorting = (row: Row, columnName: string) => row[columnName],
  defaultSortColumn,
  defaultSortDirection = "asc",
  appendToBody,
  children,
  ...tableProps
}: PropsWithChildren<TableProps<Row>>) {
  const {
    sortedRows,
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
  } = useTableSorting<Row>({
    rows,
    defaultSortColumn,
    defaultSortDirection,
    formatValueForSorting,
  });

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
        {sortedRows.map((row, index) => (
          <React.Fragment key={String(row.id) || index}>
            {rowRenderer(row)}
          </React.Fragment>
        ))}
        {appendToBody}
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
            name={sortDirection === "desc" ? "chevronup" : "chevrondown"}
            color={"var(--mb-color-text-medium)"}
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
