import cx from "classnames";
import React from "react";

import {
  PaginationControls,
  type PaginationControlsProps,
} from "metabase/common/components/PaginationControls";
import { Box, Flex, type FlexProps, Icon, Stack } from "metabase/ui";
import { SortDirection } from "metabase-types/api/sorting";

import CS from "./Table.module.css";
import type { ColumnItem } from "./types";

export type BaseRow = Record<string, unknown> & { id: number | string };

export type TableProps<Row extends BaseRow> = {
  columns: ColumnItem[];
  rows: Row[];
  rowRenderer: (row: Row) => React.ReactNode;
  sortColumnName?: string | null;
  sortDirection?: SortDirection;
  onSort?: (columnName: string, direction: SortDirection) => void;
  paginationProps?: Pick<
    PaginationControlsProps,
    "page" | "pageSize" | "total" | "showTotal"
  > & { onPageChange: (page: number) => void };
  emptyBody?: React.ReactNode;
  cols?: React.ReactNode;
} & Omit<React.HTMLProps<HTMLTableElement>, "rows" | "cols">;

/**
 * A basic reusable table component
 *
 * @param props.columns         - an array of objects with name and key properties
 * @param props.rows            - an array of objects with keys that match the column keys
 * @param props.rowRenderer     - a function that takes a row object and returns a <tr> element
 * @param props.sortColumnName  - ID of the column currently used in row sorting
 * @param props.sortDirection   - The direction of the sort. Can be "asc" or "desc"
 * @param props.onSort          - a callback containing updated sort info for when a header is clicked
 * @param props.paginationProps - a map of information used to render pagination controls.
 * @param props.emptyBody       - content to be displayed when the row count is 0
 * @param props.cols            - a ReactNode that is inserted in the table element before <thead>. Useful for defining <colgroups> and <cols>
 * @param props.className       - this will be added to the <table> element along with the default classname
 * @note All other props are passed to the <table> element
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
  className,
  ...rest
}: TableProps<Row>) {
  return (
    <Stack gap="sm">
      <table className={cx(CS.Table, className)} {...rest}>
        {cols && <colgroup>{cols}</colgroup>}
        <thead>
          <tr>
            {columns.map((column) => {
              const { sortable = true } = column;
              return (
                <th key={String(column.key)}>
                  {onSort && sortable ? (
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
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <React.Fragment key={String(row.id) || index}>
                {rowRenderer(row)}
              </React.Fragment>
            ))
          ) : (
            <tr className={CS.EmptyTableRow}>
              <td colSpan={columns.length}>{emptyBody}</td>
            </tr>
          )}
        </tbody>
      </table>

      {paginationProps && (
        <Flex justify="end">
          <PaginationControls
            page={paginationProps.page}
            pageSize={paginationProps.pageSize}
            total={paginationProps.total}
            showTotal={paginationProps.showTotal}
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
    </Stack>
  );
}

function ColumnHeader({
  column,
  sortColumn,
  sortDirection,
  onSort,
  ...rest
}: {
  column: ColumnItem;
  sortColumn?: string | null;
  sortDirection?: SortDirection;
  onSort: (column: string, direction: SortDirection) => void;
} & FlexProps) {
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
      {...rest}
    >
      {column.name}
      {
        column.name && column.key === sortColumn ? (
          <Icon
            name={
              sortDirection === SortDirection.Asc ? "chevronup" : "chevrondown"
            }
            c="text-secondary"
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
