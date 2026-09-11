import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useScrollToTop, useSortingStateChange } from "metabase/common/hooks";
import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import {
  Box,
  Ellipsified,
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
import { useApiKeyUsageEventsQuery } from "metabase-enterprise/monitor/api-key-usage/hooks/useApiKeyUsageEventsQuery";
import {
  API_KEY_USAGE_EVENT_SORT_COLUMNS,
  type ApiKeyUsageEventSortColumn,
  type ApiKeyUsageFilters,
  apiKeyUsageEventColumnKeys,
  buildEventsQuery,
} from "metabase-enterprise/monitor/api-key-usage/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { RowValue, RowValues, SortingOptions } from "metabase-types/api";

export const EVENTS_PAGE_SIZE = 25;

const DEFAULT_SORTING: SortingOptions<ApiKeyUsageEventSortColumn> = {
  sort_column: "created_at",
  sort_direction: "desc",
};

type EventColumn = {
  key: ApiKeyUsageEventSortColumn;
  title: string;
  sort?: ApiKeyUsageEventSortColumn;
  align?: "right";
  grow?: boolean;
  render?: (value: RowValue) => ReactNode;
};

const EVENT_COLUMN_META: Record<
  ApiKeyUsageEventSortColumn,
  () => Omit<EventColumn, "key">
> = {
  log_id: () => ({ title: t`ID`, sort: "log_id" }),
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
  route_template: () => ({
    title: t`Route`,
    sort: "route_template",
    grow: true,
    render: (value) =>
      value == null ? (
        EMPTY_CELL_PLACEHOLDER
      ) : (
        <Ellipsified>{String(value)}</Ellipsified>
      ),
  }),
  http_method: () => ({ title: t`Method`, sort: "http_method" }),
  status: () => ({ title: t`Status`, sort: "status", align: "right" }),
  duration_ms: () => ({
    title: t`Duration (ms)`,
    sort: "duration_ms",
    align: "right",
    render: (value) =>
      value == null ? EMPTY_CELL_PLACEHOLDER : formatNumber(Number(value)),
  }),
  api_key_name: () => ({ title: t`API key`, sort: "api_key_name" }),
  user_display_name: () => ({ title: t`User`, sort: "user_display_name" }),
  client_display_name: () => ({
    title: t`Client`,
    sort: "client_display_name",
  }),
  embedding_client: () => ({
    title: t`Embedding client`,
    sort: "embedding_client",
  }),
  embedding_hostname: () => ({
    title: t`Embedding hostname`,
    sort: "embedding_hostname",
  }),
  tenant_name: () => ({ title: t`Tenant`, sort: "tenant_name" }),
  ip_address: () => ({ title: t`IP address`, sort: "ip_address" }),
};

export function eventColumns(
  hasTenants: boolean,
  hasPii: boolean,
): EventColumn[] {
  return apiKeyUsageEventColumnKeys(hasTenants, hasPii).map((key) => ({
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
  sortingOptions: SortingOptions<ApiKeyUsageEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ApiKeyUsageEventSortColumn>,
  ) => void;
};

type Nullable<T> = { [K in keyof T]: T[K] | null };

type MetadataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

type BaseProps = ApiKeyUsageFilters &
  PaginationProps &
  SortProps & {
    hasTenants: boolean;
    hasPii: boolean;
  };

type Props = BaseProps & Nullable<MetadataSources>;
type InnerProps = BaseProps & MetadataSources;

export function ApiKeyUsageEventsTable({
  provider,
  table,
  groupMembersTable,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return null;
  }
  return (
    <ApiKeyUsageEventsTableInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      {...rest}
    />
  );
}

function ApiKeyUsageEventsTableInner({
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

  const { data, isFetching, error } = useApiKeyUsageEventsQuery(
    query,
    page,
    EVENTS_PAGE_SIZE,
  );

  // The result columns (`data.data.cols`) are the full, warehouse-ordered set the query returns —
  // not the curated `columns` we render. So we map each curated column to its position in the
  // result by name. Names are upper- or lower-cased depending on the warehouse, so match case-insensitively.
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
      const id = String(values.log_id ?? `${page}-${rowIndex}`);
      return { id, ...values };
    });
  }, [data, columns, columnIndex, page]);

  const treeColumns = useMemo<TreeTableColumnDef<EventRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.title,
        ...(column.grow
          ? { minWidth: 120 }
          : { width: "auto" as const, minWidth: 120, maxAutoWidth: 320 }),
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
    columns: API_KEY_USAGE_EVENT_SORT_COLUMNS,
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
    <Stack gap="lg" flex={1} mih={0}>
      <MonitorTableCard
        aria-busy={isFetching}
        data-testid="api-key-usage-events-table"
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
              ariaLabel={t`Calls`}
              emptyState={<MonitorEmptyState label={t`No calls found`} />}
              getRowProps={() => ({ "data-testid": "api-key-usage-event" })}
            />
          </>
        )}
      </MonitorTableCard>

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
