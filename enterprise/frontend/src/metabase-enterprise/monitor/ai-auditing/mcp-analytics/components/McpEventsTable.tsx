import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import { useMcpEventsQuery } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/hooks/useMcpEventsQuery";
import {
  MCP_EVENT_SORT_COLUMNS,
  type McpEventSortColumn,
  type McpFilters,
  mcpEventColumnKeys,
} from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";
import { buildEventsQuery } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { RowValue, RowValues, SortingOptions } from "metabase-types/api";

export const EVENTS_PAGE_SIZE = 25;

const DEFAULT_SORTING: SortingOptions<McpEventSortColumn> = {
  sort_column: "created_at",
  sort_direction: "desc",
};

type EventColumn = {
  key: McpEventSortColumn;
  title: string;
  sort?: McpEventSortColumn;
  align?: "right";
  render?: (value: RowValue) => ReactNode;
};

const EVENT_COLUMN_META: Record<
  McpEventSortColumn,
  () => Omit<EventColumn, "key">
> = {
  tool_call_id: () => ({ title: t`ID`, sort: "tool_call_id" }),
  created_at: () => ({
    title: t`Created at`,
    sort: "created_at",
    render: (value) =>
      value == null ? (
        EMPTY_CELL_PLACEHOLDER
      ) : (
        <DateTime value={String(value)} />
      ),
  }),
  tool_name: () => ({ title: t`Tool`, sort: "tool_name" }),
  client_display_name: () => ({
    title: t`Client`,
    sort: "client_display_name",
  }),
  client_version: () => ({
    title: t`Client version`,
    sort: "client_version",
  }),
  user_display_name: () => ({ title: t`User`, sort: "user_display_name" }),
  tenant_name: () => ({ title: t`Tenant`, sort: "tenant_name" }),
  ip_address: () => ({ title: t`IP address`, sort: "ip_address" }),
  status: () => ({ title: t`Status`, sort: "status" }),
  duration_ms: () => ({
    title: t`Duration (ms)`,
    sort: "duration_ms",
    align: "right",
    render: (value) =>
      value == null ? EMPTY_CELL_PLACEHOLDER : formatNumber(Number(value)),
  }),
  error_type: () => ({ title: t`Error type`, sort: "error_type" }),
  error_message: () => ({ title: t`Error message`, sort: "error_message" }),
};

/**
 * The curated columns surfaced in the events table, in display order. Derived from the same
 * {@link mcpEventColumnKeys} the row-level query projects to (see `buildEventsQuery`). Any other view column (raw ids, client_name, user_agent, …) is never even requested, and
 * `tenant_name`/`ip_address`/`error_message` are only requested when tenants/PII retention are
 * enabled.
 */
export function eventColumns(
  hasTenants: boolean,
  hasPii: boolean,
): EventColumn[] {
  return mcpEventColumnKeys(hasTenants, hasPii).map((key) => ({
    key,
    ...EVENT_COLUMN_META[key](),
  }));
}

function renderCell(column: EventColumn, value: RowValue): ReactNode {
  if (column.render) {
    return column.render(value);
  }
  return value == null || value === "" ? EMPTY_CELL_PLACEHOLDER : String(value);
}

type EventRow = { id: string } & Record<string, RowValue>;

type PaginationProps = {
  page: number;
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

type Props = BaseProps & Nullable<MetadataSources>;
type InnerProps = BaseProps & MetadataSources;

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

  const { sort_column: sortColumn, sort_direction: sortDirection } =
    sortingOptions;
  const effectiveSorting = useMemo(() => {
    const visibleSortColumns = new Set(
      columns.map((column) => column.sort).filter(Boolean),
    );
    return visibleSortColumns.has(sortColumn)
      ? { sort_column: sortColumn, sort_direction: sortDirection }
      : DEFAULT_SORTING;
  }, [columns, sortColumn, sortDirection]);

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
        hasTenants,
        hasPii,
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
      hasTenants,
      hasPii,
    ],
  );

  const { data, isFetching, error } = useMcpEventsQuery(
    query,
    page,
    EVENTS_PAGE_SIZE,
  );

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
        enableSorting: !!column.sort,
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
        {error ? (
          <Flex mih="60vh" align="center" justify="center">
            <LoadingAndErrorWrapper loading={false} error={error} />
          </Flex>
        ) : !data ? (
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

      {data && !error && (
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
