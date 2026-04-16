import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListMetricsQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import {
  Button,
  Card,
  Ellipsified,
  EntityNameCell,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Metric } from "metabase-types/api";

const EMPTY_METRICS: Metric[] = [];
const getNodeId = (metric: Metric) => String(metric.id);
const getSubRows = () => undefined;

const globalFilterFn = (
  row: { original: Metric },
  _columnId: string,
  filterValue: string,
) => {
  const query = String(filterValue).toLowerCase();
  return row.original.name.toLowerCase().includes(query);
};

export function MetricListPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: metrics, error, isLoading } = useListMetricsQuery();

  const columnDefs = useMemo<TreeTableColumnDef<Metric>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 280,
        maxAutoWidth: 800,
        enableSorting: true,
        cell: ({ row }) => (
          <EntityNameCell
            icon="metric"
            iconColor="brand"
            name={row.original.name}
          />
        ),
      },
      {
        id: "description",
        accessorKey: "description",
        header: t`Description`,
        minWidth: 200,
        maxAutoWidth: 600,
        enableSorting: true,
        cell: ({ row }) =>
          row.original.description ? (
            <Ellipsified>{row.original.description}</Ellipsified>
          ) : null,
      },
      {
        id: "collection",
        accessorFn: (metric) => metric.collection?.name ?? "",
        header: t`Collection`,
        minWidth: 160,
        enableSorting: true,
        cell: ({ row }) =>
          row.original.collection?.name ? (
            <Ellipsified>{row.original.collection.name}</Ellipsified>
          ) : null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: metrics?.data ?? EMPTY_METRICS,
    columns: columnDefs,
    getNodeId,
    getSubRows,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
  });

  const getRowHref = useCallback(
    (row: Row<Metric>) => Urls.dataStudioMetric(row.original.id),
    [],
  );

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const hasNoData = !metrics?.data.length;
  const hasNoResults = !hasNoData && treeTableInstance.rows.length === 0;

  const emptyMessage = hasNoData
    ? t`No metrics yet`
    : hasNoResults && searchQuery
      ? t`No metrics found`
      : null;

  return (
    <PageContainer data-testid="metrics-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Metrics`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack className={CS.overflowHidden}>
        <Flex gap="md">
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="filled"
            component={ForwardRefLink}
            to={Urls.newDataStudioMetric()}
            leftSection={<Icon name="add" />}
          >
            {t`New metric`}
          </Button>
        </Flex>

        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[0.4, 0.35, 0.25]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              getRowHref={getRowHref}
              emptyState={
                emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
              }
            />
          )}
        </Card>
      </Stack>
    </PageContainer>
  );
}
