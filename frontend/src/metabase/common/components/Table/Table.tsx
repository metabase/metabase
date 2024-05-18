import React from "react";

import { color } from "metabase/lib/colors";
import { Box, Flex, Icon } from "metabase/ui";

type BaseRow = Record<string, unknown> & { id: number | string };

type ColumnItem = {
  name: string;
  key: string;
};

export type TableProps<Row extends BaseRow> = {
  columns: ColumnItem[];
  rows: Row[];
  rowRenderer: (row: Row) => React.ReactNode;
  tableProps?: React.HTMLAttributes<HTMLTableElement>;
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
  ...tableProps
}: TableProps<Row>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "asc",
  );

  const sortedRows = React.useMemo(() => {
    if (sortColumn) {
      return [...rows].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        if (
          aValue === bValue ||
          !isSortableValue(aValue) ||
          !isSortableValue(bValue)
        ) {
          return 0;
        }
        if (sortDirection === "asc") {
          return aValue < bValue ? -1 : 1;
        } else {
          return aValue > bValue ? -1 : 1;
        }
      });
    }
    return rows;
  }, [rows, sortColumn, sortDirection]);

  return (
    <table {...tableProps}>
      <thead>
        <tr>
          {columns.map(column => (
            <th key={String(column.key)}>
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
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (column: string, direction: "asc" | "desc") => void;
}) {
  return (
    <Flex
      gap="sm"
      align="center"
      style={{ cursor: "pointer" }}
      onClick={() =>
        onSort(
          String(column.key),
          sortColumn === column.key && sortDirection === "asc" ? "desc" : "asc",
        )
      }
    >
      {column.name}
      {
        column.name && column.key === sortColumn ? (
          <Icon
            name={sortDirection === "desc" ? "chevronup" : "chevrondown"}
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
