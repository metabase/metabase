import cx from "classnames";
import type { HTMLAttributes, Key, ReactNode } from "react";
import { t } from "ttag";

import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Card, Flex, LoadingOverlay } from "metabase/ui";
import type { SortingOptions } from "metabase-types/api";

import S from "./AdminDataTable.module.css";

export type AdminDataTableAlign = "left" | "center" | "right";

export type AdminDataTableColumn<Row, SortColumn extends string = string> = {
  /** Stable React key for the column, also used for the cell key. */
  key: string;
  title: ReactNode;
  /** Present when the column can be sorted; wires the header to `sorting`. */
  sortKey?: SortColumn;
  align?: AdminDataTableAlign;
  render: (row: Row) => ReactNode;
  /** Extra props forwarded to the `<th>` (e.g. a fixed width). */
  headerProps?: Partial<HTMLAttributes<HTMLTableHeaderCellElement>>;
};

export type AdminDataTableSorting<SortColumn extends string> = {
  sortingOptions: SortingOptions<SortColumn>;
  onSortingOptionsChange: (sortingOptions: SortingOptions<SortColumn>) => void;
};

export type AdminDataTablePagination = {
  /** Current page, 0-indexed. */
  page: number;
  pageSize: number;
  /** Total number of rows across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Whether to render the "of N" total (defaults to true). */
  showTotal?: boolean;
};

export type AdminDataTableProps<Row, SortColumn extends string = string> = {
  columns: AdminDataTableColumn<Row, SortColumn>[];
  rows: Row[];
  /** Stable key per row; falls back to the row index. */
  getRowKey?: (row: Row, index: number) => Key;
  sorting?: AdminDataTableSorting<SortColumn>;
  pagination?: AdminDataTablePagination;
  loading?: boolean;
  error?: unknown;
  /** Message shown when there are no rows (and not loading/erroring). */
  emptyText?: ReactNode;
  onRowClick?: (row: Row) => void;
  /** Wrap the table in the bordered admin `Card` surface (defaults to true). */
  withCard?: boolean;
  /**
   * Cap the table body's height (any CSS length, e.g. `calc(100vh - 23rem)`) so it scrolls
   * internally with sticky headers, keeping the pagination controls in view.
   */
  maxBodyHeight?: string;
  /** Class applied to the scrolling container wrapping the table. */
  className?: string;
  /** Class applied to the `<table>` itself. */
  tableClassName?: string;
  "data-testid"?: string;
};

/**
 * Generic admin list table built on the shared primitives (`SortableColumnHeader`,
 * `PaginationControls`, `AdminS.ContentTable`, `LoadingAndErrorWrapper`). Callers declare
 * `columns` + `rows` and, optionally, `sorting` / `pagination` / loading-error-empty states; the
 * component stays agnostic about how the rows were fetched.
 */
export function AdminDataTable<Row, SortColumn extends string = string>({
  columns,
  rows,
  getRowKey,
  sorting,
  pagination,
  loading = false,
  error,
  emptyText = t`No results found`,
  onRowClick,
  withCard = true,
  maxBodyHeight,
  className,
  tableClassName,
  "data-testid": dataTestId,
}: AdminDataTableProps<Row, SortColumn>) {
  // While an initial load or an error is in flight there is nothing to show, so hand the whole body
  // to LoadingAndErrorWrapper. Once we have rows, keep showing them and overlay a spinner instead,
  // so paging/sorting doesn't blank the table out.
  const showLoadingOrError = error != null || (loading && rows.length === 0);
  const showEmpty = !loading && error == null && rows.length === 0;
  const showOverlay = loading && rows.length > 0;

  const table = (
    <Box pos="relative">
      <LoadingOverlay visible={showOverlay} />
      <Box
        data-testid="admin-data-table-body"
        className={cx(maxBodyHeight != null && S.scrollBox, className)}
        style={maxBodyHeight != null ? { maxHeight: maxBodyHeight } : undefined}
      >
        <table
          data-testid={dataTestId}
          className={cx(AdminS.ContentTable, S.table, tableClassName)}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <SortableColumnHeader
                  key={column.key}
                  name={column.sortKey}
                  sortingOptions={sorting?.sortingOptions}
                  onSortingOptionsChange={sorting?.onSortingOptionsChange}
                  columnHeaderProps={{
                    ...column.headerProps,
                    style: {
                      textAlign: column.align,
                      ...column.headerProps?.style,
                    },
                  }}
                >
                  {column.title}
                </SortableColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {showLoadingOrError ? (
              <tr>
                <td colSpan={columns.length}>
                  <LoadingAndErrorWrapper loading={loading} error={error} />
                </td>
              </tr>
            ) : showEmpty ? (
              <tr>
                <td colSpan={columns.length}>
                  <Flex c="text-disabled" justify="center">
                    {emptyText}
                  </Flex>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
                  className={onRowClick ? CS.cursorPointer : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} style={{ textAlign: column.align }}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Box>
    </Box>
  );

  return (
    <>
      {withCard ? (
        <Card withBorder shadow="none" p={0}>
          {table}
        </Card>
      ) : (
        table
      )}

      {pagination && (
        <Flex justify="flex-end" mt="md">
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            itemsLength={rows.length}
            total={pagination.total}
            showTotal={pagination.showTotal ?? true}
            onPreviousPage={() => pagination.onPageChange(pagination.page - 1)}
            onNextPage={() => pagination.onPageChange(pagination.page + 1)}
          />
        </Flex>
      )}
    </>
  );
}
