import React from "react";

import PaginationControls from "metabase/components/PaginationControls";
import type { PaginationControlsProps } from "metabase/components/PaginationControls/types";
import { Box, Flex, Icon } from "metabase/ui";
import { SortDirection } from "metabase-types/api/sorting";

import CS from "./Table.module.css";

export type BaseRow = Record<string, unknown> & { id: number | string };

type ColumnItem = {
  name: string;
  key: string;
  sortable?: boolean;
};

export type TableProps<Row extends BaseRow> = {
  columns: ColumnItem[];
  rows: Row[];
  rowRenderer: (row: Row) => React.ReactNode;
  sortColumnName?: string | null;
  sortDirection?: SortDirection;
  onSort?: (columnName: string, direction: SortDirection) => void;
  paginationProps?: Pick<
    PaginationControlsProps,
    "page" | "pageSize" | "total"
  > & { onPageChange: (page: number) => void };
  emptyBody?: React.ReactNode;
  cols?: React.ReactNode;
};

/**
 * A basic reusable table component
 *
 * @param props.columns         - an array of objects with name and key properties
 * @param props.rows            - an array of objects with keys that match the column keys
 * @param props.rowRenderer     - a function that takes a row object and returns a <tr> element
 * @param props.emptyBody       - content to be displayed when the row count is 0
 * @param props.cols            - a ReactNode that is inserted in the table element before <thead>. Useful for defining <colgroups> and <cols>
 * @param props.sortColumnName  - ID of the column currently used in row sorting
 * @param props.sortDirection   - The direction of the sort. Can be "asc" or "desc"
 * @param props.onSort          - a callback containing updated sort info for when a header is clicked
 * @param props.paginationProps - a map of information used to render pagination controls.
 */

export function Table<Row extends BaseRow>({
  columns,
  rows,
  rowRenderer,
  sortColumnName,
  sortDirection,
  onSort,
  paginationProps,
  emptyBody,
  cols,
  ...rest
}: TableProps<Row>) {
  return (
    <>
      <table {...rest} className={CS.Table}>
        {cols && <colgroup>{cols}</colgroup>}
        <thead>
          <tr>
            {columns.map(column => (
              <th key={String(column.key)}>
                {onSort && column.sortable !== false ? (
                  <ColumnHeader
                    column={column}
                    sortColumn={sortColumnName}
                    sortDirection={sortDirection}
                    onSort={(columnKey: string, direction: SortDirection) => {
                      onSort(columnKey, direction);
                    }}
                  />
                ) : (
                  column.name
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0
            ? rows.map((row, index) => (
                <React.Fragment key={String(row.id) || index}>
                  {rowRenderer(row)}
                </React.Fragment>
              ))
            : emptyBody}
        </tbody>
      </table>

      {paginationProps && (
        <Flex justify="end">
          <PaginationControls
            page={paginationProps.page}
            pageSize={paginationProps.pageSize}
            total={paginationProps.total}
            itemsLength={rows.length}
            onNextPage={() =>
              paginationProps.onPageChange(paginationProps.page + 1)
            }
            onPreviousPage={() =>
              paginationProps.onPageChange(paginationProps.page - 1)
            }
          />
        </Flex>
      )}
    </>
  );
}

function ColumnHeader({
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: ColumnItem;
  sortColumn?: string | null;
  sortDirection?: SortDirection;
  onSort: (column: string, direction: SortDirection) => void;
}) {
  return (
    <Flex
      gap="sm"
      align="center"
      style={{ cursor: "pointer" }}
      onClick={() =>
        onSort(
          String(column.key),
          sortColumn === column.key && sortDirection === SortDirection.Asc
            ? SortDirection.Desc
            : SortDirection.Asc,
        )
      }
    >
      {column.name}
      {
        column.name && column.key === sortColumn ? (
          <Icon
            name={
              sortDirection === SortDirection.Asc ? "chevronup" : "chevrondown"
            }
            color="var(--mb-color-text-medium)"
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
