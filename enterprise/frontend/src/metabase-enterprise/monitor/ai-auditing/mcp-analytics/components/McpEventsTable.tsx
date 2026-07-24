import { type ReactNode, useMemo, useRef } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useScrollToTop, useSortingStateChange } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import {
  Box,
  Card,
  Flex,
  LoadingOverlay,
  Stack,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { RowValue, RowValues, SortingOptions } from "metabase-types/api";

import { useMcpEventsQuery } from "../hooks/useMcpEventsQuery";
import {
  MCP_EVENT_SORT_COLUMNS,
  type McpEventSortColumn,
  type McpFilters,
} from "../query-utils";
import { buildEventsQuery } from "../query-utils";

export const EVENTS_PAGE_SIZE = 25;

const DEFAULT_SORTING: SortingOptions<McpEventSortColumn> = {
  sort_column: "created_at",
  sort_direction: "desc",
};

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
    { key: "tool_call_id", title: t`ID`, sort: "tool_call_id" },
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
    {
      key: "client_version",
      title: t`Client version`,
      sort: "client_version",
    },
    { key: "user_display_name", title: t`User`, sort: "user_display_name" },
    hasTenants && {
      key: "tenant_name",
      title: t`Tenant`,
      sort: "tenant_name",
    },
    hasPii && { key: "ip_address", title: t`IP address`, sort: "ip_address" },
    { key: "status", title: t`Status`, sort: "status" },
    {
      key: "duration_ms",
      title: t`Duration (ms)`,
      sort: "duration_ms",
      align: "right",
      render: (value) =>
        value == null ? EMPTY_CELL_PLACEHOLDER : formatNumber(Number(value)),
    },
    { key: "error_type", title: t`Error type`, sort: "error_type" },
    hasPii && {
      key: "error_message",
      title: t`Error message`,
      sort: "error_message",
    },
  ];
  return columns.filter((column): column is EventColumn => column !== false);
}

function renderCell(column: EventColumn, value: RowValue): ReactNode {
  if (column.render) {
    return column.render(value);
  }
  return value == null || value === "" ? EMPTY_CELL_PLACEHOLDER : String(value);
}

type EventRow = { id: string } & Record<string, RowValue>;

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
 * and renders the tool calls as a sortable {@link TreeTable} with pagination controls.
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
  const columns = useMemo(
    () => eventColumns(hasTenants, hasPii),
    [hasTenants, hasPii],
  );

  const effectiveSorting = useMemo(() => {
    const visibleSortColumns = new Set(
      columns.map((column) => column.sort).filter(Boolean),
    );
    return visibleSortColumns.has(sortingOptions.sort_column)
      ? sortingOptions
      : DEFAULT_SORTING;
  }, [columns, sortingOptions]);

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
        sortColumn: effectiveSorting.sort_column,
        sortDirection: effectiveSorting.sort_direction,
      }),
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      effectiveSorting,
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

  // The result columns (`data.data.cols`) are the full, warehouse-ordered set the query returns —
  // not the curated `columns` we render. So we map each curated column to its position in the
  // result by name. Names are upper- or lower-cased depending on the warehouse (the audit DB is H2,
  // which upper-cases; Postgres lower-cases), so match case-insensitively.
  const columnIndex = useMemo(() => {
    const cols = data?.data?.cols ?? [];
    return new Map(cols.map((col, index) => [col.name.toLowerCase(), index]));
  }, [data]);

  const rows: EventRow[] = useMemo(() => {
    const rawRows: RowValues[] = data?.data?.rows ?? [];
    return rawRows.map((rawRow, rowIndex) => {
      const values = Object.fromEntries(
        columns.map((column) => {
          const index = columnIndex.get(column.key);
          return [column.key, index != null ? rawRow[index] : null];
        }),
      );
      const id = String(values.tool_call_id ?? `${page}-${rowIndex}`);
      return { id, ...values };
    });
  }, [data, columns, columnIndex, page]);

  const treeColumns = useMemo<TreeTableColumnDef<EventRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.title,
        width: "auto",
        minWidth: 120,
        maxAutoWidth: 320,
        enableSorting: column.sort != null,
        sortDescFirst: column.sort === "created_at",
        accessorFn: (row) => row[column.key],
        cell: ({ row }) => {
          const node = renderCell(column, row.original[column.key]);
          return column.align === "right" ? (
            <Box ta="right" w="100%">
              {node}
            </Box>
          ) : (
            node
          );
        },
      })),
    [columns],
  );

  const { sortingState, onSortingChange } = useSortingStateChange({
    sortingOptions: effectiveSorting,
    columns: MCP_EVENT_SORT_COLUMNS,
    defaultSorting: DEFAULT_SORTING,
    onSortingOptionsChange,
  });

  const treeTableInstance = useTreeTableInstance<EventRow>({
    data: rows,
    columns: treeColumns,
    sorting: sortingState,
    manualSorting: true,
    getNodeId: (row) => row.id,
    onSortingChange,
  });

  useScrollToTop({
    ref: treeTableInstance.containerRef,
    keys: [page, effectiveSorting],
    skip: isFetching,
  });

  const skeletonColumnWidths = columns.map(() => 1 / columns.length);

  return (
    <Stack gap="md" flex={1} mih={0}>
      <Card
        flex="0 1 auto"
        mih={0}
        p={0}
        pos="relative"
        withBorder
        data-testid="mcp-events-table"
      >
        {data == null ? (
          <TreeTableSkeleton columnWidths={skeletonColumnWidths} />
        ) : (
          <>
            <LoadingOverlay visible={isFetching} />
            <TreeTable
              instance={treeTableInstance}
              hierarchical={false}
              ariaLabel={t`Tool calls`}
              emptyState={<MonitorEmptyState label={t`No tool calls found`} />}
              getRowProps={() => ({ "data-testid": "mcp-event" })}
            />
          </>
        )}
      </Card>

      {data != null && (
        <Flex justify="flex-end">
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
      )}
    </Stack>
  );
}
