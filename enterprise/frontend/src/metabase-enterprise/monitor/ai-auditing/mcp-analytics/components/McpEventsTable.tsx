import cx from "classnames";
import { type ReactNode, useMemo, useRef } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import AdminS from "metabase/css/admin.module.css";
import { Box, Card, Flex, LoadingOverlay } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { RowValue, RowValues, SortingOptions } from "metabase-types/api";

import { useMcpEventsQuery } from "../hooks/useMcpEventsQuery";
import type { McpEventSortColumn, McpFilters } from "../query-utils";
import { buildEventsQuery } from "../query-utils";

import S from "./McpEventsTable.module.css";

export const EVENTS_PAGE_SIZE = 25;

type EventColumn = {
  /** View column name, matched case-insensitively against the result columns. */
  key: string;
  title: string;
  /** Present when the column can be sorted server-side. */
  sort?: McpEventSortColumn;
  align?: "right";
  render?: (value: RowValue) => ReactNode;
};

/**
 * The curated columns surfaced in the events table, in display order. Only these are ever
 * rendered — every other view column (raw ids, client_name, user_agent, …) stays hidden by
 * construction, so nothing sensitive can leak. `tenant_name` shows only when tenants are enabled;
 * `ip_address`/`error_message` only when PII retention is on (they're null otherwise).
 */
export function eventColumns(
  hasTenants: boolean,
  hasPii: boolean,
): EventColumn[] {
  const columns: (EventColumn | false)[] = [
    { key: "tool_call_id", title: t`ID` },
    {
      key: "created_at",
      title: t`Created at`,
      sort: "created_at",
      render: (value) =>
        value == null ? (
          EMPTY_CELL_PLACEHOLDER
        ) : (
          <DateTime value={String(value)} />
        ),
    },
    { key: "tool_name", title: t`Tool`, sort: "tool_name" },
    {
      key: "client_display_name",
      title: t`Client`,
      sort: "client_display_name",
    },
    { key: "client_version", title: t`Client version` },
    { key: "user_display_name", title: t`User`, sort: "user_display_name" },
    hasTenants && { key: "tenant_name", title: t`Tenant` },
    hasPii && { key: "ip_address", title: t`IP address` },
    { key: "status", title: t`Status`, sort: "status" },
    {
      key: "duration_ms",
      title: t`Duration (ms)`,
      sort: "duration_ms",
      align: "right",
      render: (value) =>
        value == null ? EMPTY_CELL_PLACEHOLDER : formatNumber(Number(value)),
    },
    { key: "error_type", title: t`Error type` },
    hasPii && { key: "error_message", title: t`Error message` },
  ];
  return columns.filter((column): column is EventColumn => column !== false);
}

function renderCell(column: EventColumn, value: RowValue): ReactNode {
  if (column.render) {
    return column.render(value);
  }
  return value == null || value === "" ? EMPTY_CELL_PLACEHOLDER : String(value);
}

type PaginationProps = {
  /** Current page, 0-indexed. */
  page: number;
  /** Total number of tool calls matching the filters (across all pages). */
  total: number;
  onPageChange: (page: number) => void;
};

type SortProps = {
  sortingOptions: SortingOptions<McpEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<McpEventSortColumn>,
  ) => void;
};

type Nullable<T> = { [K in keyof T]: T[K] | null };

// The audit metadata sources the inner table needs, all resolved.
type MetadataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

type BaseProps = McpFilters &
  PaginationProps &
  SortProps & {
    hasTenants: boolean;
    hasPii: boolean;
  };

// Sources are still loading in the outer props (hence nullable); the inner component only renders
// once they're resolved, so it takes them non-null.
type Props = BaseProps & Nullable<MetadataSources>;
type InnerProps = BaseProps & MetadataSources;

/**
 * Retain the last non-nullish value so a component keeps rendering the previous result while the
 * next one loads. RTK query hooks return `undefined` data mid-fetch; without this a consumer would
 * blank out on every refetch.
 */
function useRetainedValue<T>(value: T | undefined): T | undefined {
  const ref = useRef(value);
  if (value != null) {
    ref.current = value;
  }
  return value ?? ref.current;
}

/**
 * Row-level events table for the Events tab. Renders nothing until the audit metadata is
 * loaded, then delegates to the inner component.
 */
export function McpEventsTable({
  provider,
  table,
  groupMembersTable,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return null;
  }
  return (
    <McpEventsTableInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      {...rest}
    />
  );
}

/**
 * Loaded variant of {@link McpEventsTable}: builds the paginated, sorted row-level query, runs it,
 * and renders the tool calls as a sortable table with pagination controls.
 */
function McpEventsTableInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  hasTenants,
  hasPii,
  page,
  total,
  onPageChange,
  sortingOptions,
  onSortingOptionsChange,
}: InnerProps) {
  const query = useMemo(
    () =>
      buildEventsQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        sortColumn: sortingOptions.sort_column,
        sortDirection: sortingOptions.sort_direction,
      }),
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      sortingOptions,
    ],
  );

  const { data: latestData, isFetching } = useMcpEventsQuery(
    query,
    page,
    EVENTS_PAGE_SIZE,
  );
  // Retain the previous page while the next one loads, so the table doesn't blank out on every
  // page or sort change; we overlay a spinner on the retained rows instead. From here on `data` is
  // simply the warehouse result — the retention is an implementation detail of the hook.
  const data = useRetainedValue(latestData);

  const columns = useMemo(
    () => eventColumns(hasTenants, hasPii),
    [hasTenants, hasPii],
  );
  const rows: RowValues[] = data?.data?.rows ?? [];
  // The result columns (`data.data.cols`) are the full, warehouse-ordered set the query returns —
  // not the curated `columns` we render. So we can't reuse the `columns` index; we map each curated
  // column to its position in the result by name. Names are upper- or lower-cased depending on the
  // warehouse (the audit DB is H2, which upper-cases; Postgres lower-cases), so match
  // case-insensitively.
  const columnIndex = useMemo(() => {
    const cols = data?.data?.cols ?? [];
    return new Map(cols.map((col, index) => [col.name.toLowerCase(), index]));
  }, [data]);

  const showEmpty = !isFetching && rows.length === 0;

  return (
    <>
      <Card withBorder shadow="none" p={0} pos="relative">
        <LoadingOverlay visible={isFetching} />
        <Box className={S.scroll}>
          <table className={cx(AdminS.ContentTable, S.table)}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <SortableColumnHeader
                    key={column.key}
                    name={column.sort}
                    sortingOptions={sortingOptions}
                    onSortingOptionsChange={onSortingOptionsChange}
                    columnHeaderProps={{ style: { textAlign: column.align } }}
                  >
                    {column.title}
                  </SortableColumnHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {showEmpty ? (
                <tr>
                  <td colSpan={columns.length}>
                    <Flex c="text-disabled" justify="center">
                      {t`No tool calls found`}
                    </Flex>
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {columns.map((column) => {
                      const index = columnIndex.get(column.key);
                      const value = index != null ? row[index] : null;
                      return (
                        <td
                          key={column.key}
                          style={{ textAlign: column.align }}
                        >
                          {renderCell(column, value)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      </Card>

      <Flex justify="flex-end" mt="md">
        <PaginationControls
          page={page}
          pageSize={EVENTS_PAGE_SIZE}
          itemsLength={rows.length}
          total={total}
          showTotal
          onPreviousPage={() => onPageChange(page - 1)}
          onNextPage={() => onPageChange(page + 1)}
        />
      </Flex>
    </>
  );
}
