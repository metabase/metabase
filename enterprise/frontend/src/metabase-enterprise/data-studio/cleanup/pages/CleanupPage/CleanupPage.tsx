import { useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackDataStudioCleanupTableSelected } from "metabase/common/data-studio/analytics";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useNavigate, useSearchParams } from "metabase/router";
import {
  Badge,
  Card,
  Center,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { UsageMetadataTableSummary } from "metabase-types/api";

import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { CleanupHeader } from "../../components/CleanupHeader";
import { PublicationStatusBadge } from "../../components/PublicationStatusBadge";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { useUsageMetadataTables } from "../../hooks/useUsageMetadataList";
import { hasActiveFilters, parseCleanupParams } from "../../utils";

type CleanupTableNode = UsageMetadataTableSummary & { id: number };

export function CleanupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = parseCleanupParams(searchParams);
  const refresh = useCleanupRefresh();
  const query = useUsageMetadataTables({
    "database-id": params.databaseId,
    queue: params.queue,
    search: params.search,
  });
  const snapshot = query.data?.snapshot ?? null;
  const rows = useMemo<CleanupTableNode[]>(
    () =>
      (query.data?.data ?? []).map((row) => ({
        ...row,
        id: Number(row.table.id),
      })),
    [query.data?.data],
  );
  const columns = useMemo<TreeTableColumnDef<CleanupTableNode>[]>(
    () => [
      {
        id: "table",
        header: t`Table`,
        minWidth: 280,
        cell: ({ row }) => (
          <Group gap="sm" wrap="nowrap" miw={0}>
            <Icon name="table" size={20} />
            <Text fw="bold" truncate>
              {row.original.table.display_name}
            </Text>
          </Group>
        ),
      },
      {
        id: "location",
        header: t`Database / schema`,
        minWidth: 240,
        cell: ({ row }) => (
          <Text c="text-secondary" truncate>
            {[row.original.table.database.name, row.original.table.schema]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ),
      },
      {
        id: "status",
        header: t`Library status`,
        width: 130,
        cell: ({ row }) => (
          <PublicationStatusBadge published={row.original.table.is_published} />
        ),
      },
      {
        id: "count",
        header: getQueueCountLabel(params.queue),
        width: 110,
        cell: ({ row }) => (
          <Text fw="bold" ta="right" w="100%">
            {row.original.candidate_count}
          </Text>
        ),
      },
    ],
    [params.queue],
  );
  const treeTableInstance = useTreeTableInstance({
    data: rows,
    columns,
    getNodeId: (row) => String(row.id),
    onRowActivate: (row) => {
      trackDataStudioCleanupTableSelected(row.original.id);
      navigate(
        Urls.dataStudioCleanupTable(row.original.id, {
          queue: params.queue,
        }),
      );
    },
  });

  const updateParams = (next: Urls.DataStudioCleanupParams) => {
    navigate(Urls.dataStudioCleanup(next), { replace: true });
  };

  return (
    <SectionLayout>
      <Stack
        h="100%"
        mih={0}
        px="3.5rem"
        pb="lg"
        gap="md"
        style={{ overflow: "hidden" }}
      >
        <CleanupHeader
          snapshot={snapshot}
          refreshStatus={refresh.status}
          isRefreshing={refresh.isRefreshing}
          isStarting={refresh.isStarting}
          onRefresh={refresh.start}
        />
        {snapshot != null && (
          <>
            <CleanupQueueTabs params={params} onChange={updateParams} />
            <CleanupFilters
              params={params}
              onChange={updateParams}
              searchPlaceholder={t`Search tables`}
            />
          </>
        )}
        {query.isFetching && query.data == null ? (
          <Card withBorder p={0} flex={1} mih={0}>
            <TreeTableSkeleton columnWidths={[0.4, 0.3, 0.15, 0.15]} />
          </Card>
        ) : query.error && query.data == null ? (
          <Center h="100%" flex={1}>
            <LoadingAndErrorWrapper error={query.error} />
          </Center>
        ) : snapshot == null ? (
          <NoSnapshotState />
        ) : rows.length === 0 ? (
          <EmptyQueueState
            filtered={hasActiveFilters(params)}
            queue={params.queue}
          />
        ) : (
          <Card
            withBorder
            p={0}
            flex={1}
            mih={0}
            style={{ overflow: "hidden" }}
            data-testid="cleanup-table-list"
            aria-busy={query.isFetchingNextPage}
          >
            <TreeTable
              instance={treeTableInstance}
              hierarchical={false}
              ariaLabel={t`Cleanup tables`}
              getRowProps={(row) => ({
                "data-testid": `cleanup-table-${row.original.table.id}`,
              })}
              onRowClick={(row) =>
                trackDataStudioCleanupTableSelected(row.original.id)
              }
              renderRowLink={(row, props) => (
                <Link
                  to={Urls.dataStudioCleanupTable(row.original.id, {
                    queue: params.queue,
                  })}
                  {...props}
                />
              )}
              onScrollEnd={query.fetchNextPage}
            />
          </Card>
        )}
      </Stack>
    </SectionLayout>
  );
}

function NoSnapshotState() {
  return (
    <Center h="100%">
      <Stack align="center" maw="34rem" ta="center">
        <Icon name="search_check" size={48} c="brand" />
        <Title order={2}>{t`Find cleanup opportunities`}</Title>
        <Text c="text-secondary">
          {t`Analyze saved questions and models to find tables, Metrics, Measures, and Segments that belong in your Library.`}
        </Text>
        <Badge size="lg" variant="light">
          {t`Read-only analysis`}
        </Badge>
      </Stack>
    </Center>
  );
}

function EmptyQueueState({
  filtered,
  queue,
}: {
  filtered: boolean;
  queue: Urls.DataStudioCleanupParams["queue"];
}) {
  return (
    <Center h="100%">
      <Stack align="center" ta="center">
        <Icon name={filtered ? "search" : "check"} size={40} />
        <Title order={3}>
          {queue === "discarded"
            ? t`No discarded suggestions`
            : queue === "used-raw"
              ? t`No raw usage to clean up`
              : filtered
                ? t`No matching tables`
                : t`Nothing to clean up`}
        </Title>
        <Text c="text-secondary">
          {queue === "discarded"
            ? t`Discarded suggestions will appear here so they can be restored.`
            : queue === "used-raw"
              ? t`No Library Measures or Segments are still being expressed as raw query clauses.`
              : filtered
                ? t`Try changing or clearing the filters.`
                : t`No Library recommendations were found in this snapshot.`}
        </Text>
      </Stack>
    </Center>
  );
}

function getQueueCountLabel(queue: Urls.DataStudioCleanupParams["queue"]) {
  switch (queue) {
    case "suggested":
      return t`Suggestions`;
    case "used-raw":
      return t`Used raw`;
    case "discarded":
      return t`Discarded`;
  }
}
