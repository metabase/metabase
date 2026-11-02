import cx from "classnames";
import type { HTMLAttributes, Key, ReactNode } from "react";
import { t } from "ttag";

import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Card, Flex } from "metabase/ui";
import type { SortingOptions } from "metabase-types/api";

import { AdminTableSkeletonRows } from "../AdminTableSkeletonRows";

import S from "./AdminDataTable.module.css";

const MAX_SKELETON_ROWS = 10;

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
  /** Whether to render the "of N" total (defaults to false, matching `PaginationControls`). */
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
  /**
   * Cap the table body's height (any CSS length, e.g. `calc(100vh - 23rem)`) so it scrolls
   * internally with sticky headers, keeping the pagination controls in view.
   */
  maxBodyHeight?: string;
  /** Class applied to the `<table>` itself. */
  tableClassName?: string;
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
  maxBodyHeight,
  tableClassName,
}: AdminDataTableProps<Row, SortColumn>) {
  // Skeleton rows only stand in for the first load. Once we have rows, keep showing them while
  // paging/sorting refetches, so the table doesn't blank out.
  const showError = error != null;
  const showSkeleton = !showError && loading && rows.length === 0;
  const showEmpty = !loading && !showError && rows.length === 0;
  const skeletonRowCount = Math.min(
    pagination?.pageSize ?? MAX_SKELETON_ROWS,
    MAX_SKELETON_ROWS,
  );

  const tableBody = (
    <Box
      data-testid="admin-data-table-body"
      className={maxBodyHeight != null ? S.scrollBox : undefined}
      style={maxBodyHeight != null ? { maxHeight: maxBodyHeight } : undefined}
    >
      <table className={cx(AdminS.ContentTable, S.table, tableClassName)}>
        <thead>
          <tr>
            {columns.map((column) => {
              const headerProps = {
                ...column.headerProps,
                style: {
                  textAlign: column.align,
                  ...column.headerProps?.style,
                },
              };
              // Only sortable columns get the interactive header; the rest render a plain `<th>`
              // so screen readers don't announce a static header as a button.
              return sorting != null && column.sortKey != null ? (
                <SortableColumnHeader
                  key={column.key}
                  name={column.sortKey}
                  sortingOptions={sorting.sortingOptions}
                  onSortingOptionsChange={sorting.onSortingOptionsChange}
                  columnHeaderProps={headerProps}
                >
                  {column.title}
                </SortableColumnHeader>
              ) : (
                <th key={column.key} {...headerProps}>
                  {column.title}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showError ? (
            <tr>
              <td colSpan={columns.length}>
                <LoadingAndErrorWrapper error={error} />
              </td>
            </tr>
          ) : showSkeleton ? (
            <AdminTableSkeletonRows
              rowCount={skeletonRowCount}
              columnCount={columns.length}
            />
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
  );

  return (
    <>
      <Card withBorder shadow="none" p={0}>
        {showSkeleton ? (
          <LoadingSkeleton gap={0}>{tableBody}</LoadingSkeleton>
        ) : (
          tableBody
        )}
      </Card>

      {pagination && (
        <Flex justify="flex-end" mt="lg">
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            itemsLength={rows.length}
            total={pagination.total}
            showTotal={pagination.showTotal ?? false}
            onPreviousPage={() => pagination.onPageChange(pagination.page - 1)}
            onNextPage={() => pagination.onPageChange(pagination.page + 1)}
          />
        </Flex>
      )}
    </>
  );
}
