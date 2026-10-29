import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
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
  type TreeTableInstance,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatNumber } from "metabase/utils/formatting";
import { useListDataAppsQuery } from "metabase-enterprise/api";
import {
  DATA_APP_LOG_COLUMNS,
  DEFAULT_SORTING,
  type DataAppLogColumn,
  type DataAppLogFilters,
  buildDataAppLogRowsQuery,
  dataAppLogColumnKeys,
} from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import * as Lib from "metabase-lib";
import type { RowValue, SortingOptions } from "metabase-types/api";

import { getEntityTypeLabel } from "./EntityTypeFilterSelect";
import { type LogRow, getEffectiveSorting, getLogRows } from "./utils";

/** Installed data apps' display names, by slug. */
type DataAppNames = ReadonlyMap<string, string>;

type LogColumn = {
  id: string;
  key: DataAppLogColumn;
  title: string;
  /** Defaults to sortable. */
  isSortable?: boolean;
  align?: "right";
  grow?: boolean;
  render?: (value: RowValue, dataAppNames: DataAppNames) => ReactNode;
};

const isBlank = (value: RowValue) => value === null || value === "";

const renderDateTime = (value: RowValue) =>
  value === null ? EMPTY_CELL_PLACEHOLDER : <DateTime value={String(value)} />;

const renderNumber = (value: RowValue) =>
  value === null ? EMPTY_CELL_PLACEHOLDER : formatNumber(Number(value));

const renderLongText = (value: RowValue) =>
  isBlank(value) ? (
    EMPTY_CELL_PLACEHOLDER
  ) : (
    <Ellipsified>{String(value)}</Ellipsified>
  );

// These ids come back remapped to a name, which is what the cell shows. Sorting would still
// order by the id, so it's off.
const getNamedReferenceMeta = (title: string) => ({ title, isSortable: false });

const COLUMN_META: Record<
  DataAppLogColumn,
  () => Omit<LogColumn, "id" | "key">
> = {
  started_at: () => ({ title: t`Started at`, render: renderDateTime }),
  running_time_seconds: () => ({
    title: t`Running time (s)`,
    align: "right",
    render: renderNumber,
  }),
  result_rows: () => ({
    title: t`Result rows`,
    align: "right",
    render: renderNumber,
  }),
  error: () => ({ title: t`Error`, grow: true, render: renderLongText }),
  user_id: () => getNamedReferenceMeta(t`User`),
  // Sorting would order by the action id, which groups the types only incidentally.
  action_id: () => ({
    title: t`Entity type`,
    isSortable: false,
    render: (value) =>
      getEntityTypeLabel(value === null ? "question" : "action"),
  }),
  card_qualified_id: () => getNamedReferenceMeta(t`Question`),
  database_qualified_id: () => getNamedReferenceMeta(t`Database`),
  action_qualified_id: () => getNamedReferenceMeta(t`Action`),
  query: () => ({ title: t`Query`, grow: true, render: renderLongText }),
  embedding_client_identifier: () => ({ title: t`Identifier` }),
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
  metabase_version: () => ({ title: t`Metabase version` }),
  user_agent: () => ({ title: t`User agent`, render: renderLongText }),
  sanitized_user_agent: () => ({ title: t`Sanitized user agent` }),
  ip_address: () => ({ title: t`IP address` }),
};

const getDataAppNameColumn = (): LogColumn => ({
  id: "data_app_name",
  key: "embedding_client_identifier",
  title: t`Name`,
  // Sorting would order by the identifier, not the name shown.
  isSortable: false,
  render: (value, dataAppNames) =>
    (value === null ? undefined : dataAppNames.get(String(value))) ??
    EMPTY_CELL_PLACEHOLDER,
});

function getLogColumns(hasPii: boolean): LogColumn[] {
  return dataAppLogColumnKeys(hasPii).flatMap((key) => {
    const column = { id: key, key, ...COLUMN_META[key]() };
    return key === "embedding_client_identifier"
      ? [column, getDataAppNameColumn()]
      : [column];
  });
}

const isSortable = (column: LogColumn) => column.isSortable !== false;

function renderCell(
  column: LogColumn,
  value: RowValue,
  dataAppNames: DataAppNames,
): ReactNode {
  if (column.render) {
    return column.render(value, dataAppNames);
  }
  return isBlank(value) ? EMPTY_CELL_PLACEHOLDER : String(value);
}

function useDataAppNames(): DataAppNames {
  const { data: dataApps } = useListDataAppsQuery();

  return useMemo(
    () =>
      new Map(
        (dataApps ?? []).map((dataApp) => [dataApp.name, dataApp.display_name]),
      ),
    [dataApps],
  );
}

type DataAppLogTableProps = {
  provider: Lib.MetadataProvider | null;
  table: Lib.TableMetadata | Lib.CardMetadata | null;
  filters: DataAppLogFilters;
  hasPii: boolean;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  sortingOptions: SortingOptions<DataAppLogColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<DataAppLogColumn>,
  ) => void;
};

type DataAppLogTableInnerProps = DataAppLogTableProps & {
  provider: Lib.MetadataProvider;
  table: Lib.TableMetadata | Lib.CardMetadata;
};

export function DataAppLogTable({
  provider,
  table,
  ...rest
}: DataAppLogTableProps) {
  if (!provider || !table) {
    return null;
  }
  return <DataAppLogTableInner provider={provider} table={table} {...rest} />;
}

function DataAppLogTableInner({
  provider,
  table,
  filters,
  hasPii,
  page,
  total,
  onPageChange,
  sortingOptions,
  onSortingOptionsChange,
}: DataAppLogTableInnerProps) {
  const dataAppNames = useDataAppNames();
  const columns = useMemo(() => getLogColumns(hasPii), [hasPii]);

  const effectiveSorting = useMemo(
    () =>
      getEffectiveSorting(
        sortingOptions,
        columns.filter(isSortable).map((column) => column.key),
      ),
    [columns, sortingOptions],
  );

  const jsQuery = useMemo(() => {
    const query = buildDataAppLogRowsQuery({
      provider,
      table,
      ...filters,
      sorting: effectiveSorting,
      hasPii,
    });
    return Lib.toJsQuery(
      Lib.withPage(query, 0, { page: page + 1, items: PAGE_SIZE }),
    );
  }, [provider, table, filters, effectiveSorting, hasPii, page]);

  const { data, isFetching, error } = useGetAdhocQueryQuery(jsQuery);

  const rows = useMemo(
    () =>
      data?.data
        ? getLogRows(
            data.data,
            columns.map((column) => column.key),
            page,
          )
        : [],
    [data, columns, page],
  );

  const treeColumns = useMemo<TreeTableColumnDef<LogRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.title,
        ...(column.grow
          ? { minWidth: 120 }
          : { width: "auto" as const, minWidth: 120, maxAutoWidth: 320 }),
        enableSorting: isSortable(column),
        sortDescFirst: column.key === DEFAULT_SORTING.sort_column,
        accessorFn: (row) => row[column.key],
        cell: ({ row }) => {
          const value = row.original[column.key] ?? null;
          const node = renderCell(column, value, dataAppNames);
          return column.align === "right" ? (
            <Box ta="right" w="100%">
              {node}
            </Box>
          ) : (
            node
          );
        },
      })),
    [columns, dataAppNames],
  );

  const { sortingState, onSortingChange } = useSortingStateChange({
    sortingOptions: effectiveSorting,
    columns: DATA_APP_LOG_COLUMNS,
    defaultSorting: DEFAULT_SORTING,
    onSortingOptionsChange,
  });

  const treeTableInstance = useTreeTableInstance<LogRow>({
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
      <MonitorTableCard aria-busy={isFetching} data-testid="data-app-log-table">
        <DataAppLogTableContent
          error={error}
          isLoaded={data !== undefined}
          isFetching={isFetching}
          instance={treeTableInstance}
          skeletonColumnWidths={skeletonColumnWidths}
        />
      </MonitorTableCard>

      {data && !error && (
        <Flex justify="flex-end">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
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

type DataAppLogTableContentProps = {
  error: unknown;
  isLoaded: boolean;
  isFetching: boolean;
  instance: TreeTableInstance<LogRow>;
  skeletonColumnWidths: number[];
};

function DataAppLogTableContent({
  error,
  isLoaded,
  isFetching,
  instance,
  skeletonColumnWidths,
}: DataAppLogTableContentProps) {
  if (error !== undefined && error !== null) {
    return (
      <Flex mih="60vh" align="center" justify="center">
        <LoadingAndErrorWrapper loading={false} error={error} />
      </Flex>
    );
  }

  if (!isLoaded) {
    return <TreeTableSkeleton columnWidths={skeletonColumnWidths} />;
  }

  return (
    <>
      <LoadingOverlay visible={isFetching} />
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel={t`Data app activity`}
        emptyState={<MonitorEmptyState label={t`No activity found`} />}
        getRowProps={() => ({ "data-testid": "data-app-log-row" })}
      />
    </>
  );
}
