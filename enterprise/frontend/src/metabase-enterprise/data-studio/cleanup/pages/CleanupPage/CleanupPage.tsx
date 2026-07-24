import type { Location } from "history";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { trackDataStudioCleanupTableSelected } from "metabase/common/data-studio/analytics";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useDispatch } from "metabase/redux";
import { replace } from "metabase/router";
import {
  Badge,
  Box,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListUsageMetadataTablesQuery } from "metabase-enterprise/api";
import type {
  UsageMetadataCandidateCounts,
  UsageMetadataModelingStatus,
  UsageMetadataTableSummary,
} from "metabase-types/api";

import { CleanupFilters } from "../../components/CleanupFilters";
import { CleanupHeader } from "../../components/CleanupHeader";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import {
  getModelingStatusLabel,
  hasActiveFilters,
  parseCleanupParams,
} from "../../utils";

const PAGE_SIZE = 50;
const STATUSES: UsageMetadataModelingStatus[] = [
  "missing",
  "partially-modeled",
  "modeled",
];

type CleanupPageProps = {
  location: Location;
};

export function CleanupPage({ location }: CleanupPageProps) {
  const dispatch = useDispatch();
  const params = parseCleanupParams(location);
  const page = params.page ?? 0;
  const refresh = useCleanupRefresh();
  const query = useListUsageMetadataTablesQuery({
    "database-id": params.databaseId,
    schema: params.schema,
    "candidate-type": params.candidateType,
    "modeling-status": params.modelingStatus,
    signal: params.signal,
    dismissed: params.dismissed,
    search: params.search,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const snapshot = query.data?.snapshot ?? null;

  const updateParams = (next: Urls.DataStudioCleanupParams) => {
    dispatch(replace(Urls.dataStudioCleanup(next)));
  };

  return (
    <SectionLayout>
      <Stack h="100%" px="3.5rem" pb="lg" gap="md">
        <CleanupHeader
          snapshot={snapshot}
          refreshStatus={refresh.status}
          isRefreshing={refresh.isRefreshing}
          isStarting={refresh.isStarting}
          onRefresh={refresh.start}
        />
        {snapshot != null && (
          <CleanupFilters params={params} onChange={updateParams} />
        )}
        <Box flex={1} mih={0}>
          {query.isLoading ? (
            <Center h="100%">
              <LoadingAndErrorWrapper loading />
            </Center>
          ) : query.error ? (
            <Center h="100%">
              <LoadingAndErrorWrapper error={query.error} />
            </Center>
          ) : snapshot == null ? (
            <NoSnapshotState />
          ) : query.data?.data.length === 0 ? (
            <EmptyQueueState filtered={hasActiveFilters(params)} />
          ) : (
            <Stack gap="sm">
              {query.data?.data.map((row) => (
                <CleanupTableRow
                  key={String(row.table.id)}
                  row={row}
                  params={params}
                />
              ))}
            </Stack>
          )}
        </Box>
        {query.data && query.data.data.length > 0 && (
          <Flex justify="flex-end">
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={query.data.data.length}
              total={query.data.total}
              showTotal
              onPreviousPage={() =>
                updateParams({ ...params, page: Math.max(0, page - 1) })
              }
              onNextPage={() => updateParams({ ...params, page: page + 1 })}
            />
          </Flex>
        )}
      </Stack>
    </SectionLayout>
  );
}

function CleanupTableRow({
  row,
  params,
}: {
  row: UsageMetadataTableSummary;
  params: Urls.DataStudioCleanupParams;
}) {
  const { table, candidate_count: candidateCount, counts } = row;

  return (
    <Card
      component={Link}
      to={Urls.dataStudioCleanupTable(table.id, {
        candidateType: params.candidateType,
        modelingStatus: params.modelingStatus,
        signal: params.signal,
        dismissed: params.dismissed,
      })}
      withBorder
      p="lg"
      c="inherit"
      style={{ textDecoration: "none" }}
      data-testid={`cleanup-table-${table.id}`}
      onClick={() => trackDataStudioCleanupTableSelected(Number(table.id))}
    >
      <Flex align="center" gap="lg" wrap="nowrap">
        <Group gap="md" flex={1} miw={0} wrap="nowrap">
          <Icon name="table" size={24} />
          <Stack gap={2} miw={0}>
            <Group gap="sm">
              <Text fw="bold" truncate>
                {table.display_name}
              </Text>
              <Badge color={table.is_published ? "positive" : "neutral"}>
                {table.is_published ? t`Published` : t`Unpublished`}
              </Badge>
            </Group>
            <Text c="text-secondary" size="sm" truncate>
              {[table.database.name, table.schema].filter(Boolean).join(" · ")}
            </Text>
          </Stack>
        </Group>
        <SimpleGrid cols={3} spacing="lg" miw="34rem">
          {STATUSES.map((status) => (
            <CountSummary key={status} status={status} counts={counts} />
          ))}
        </SimpleGrid>
        <Stack gap={0} align="flex-end" miw="5rem">
          <Text fw="bold">{candidateCount}</Text>
          <Text c="text-secondary" size="xs">{t`candidates`}</Text>
        </Stack>
        <Icon name="chevronright" />
      </Flex>
    </Card>
  );
}

function CountSummary({
  status,
  counts,
}: {
  status: UsageMetadataModelingStatus;
  counts: UsageMetadataCandidateCounts;
}) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="text-secondary">
        {getModelingStatusLabel(status)}
      </Text>
      <Group gap="xs">
        <Text size="sm">{t`Measures`}</Text>
        <Badge size="sm" variant="light">
          {counts.measure[status]}
        </Badge>
        <Text size="sm">{t`Segments`}</Text>
        <Badge size="sm" variant="light">
          {counts.segment[status]}
        </Badge>
      </Group>
    </Stack>
  );
}

function NoSnapshotState() {
  return (
    <Center h="100%">
      <Stack align="center" maw="34rem" ta="center">
        <Icon name="search_check" size={48} c="brand" />
        <Title order={2}>{t`Find cleanup opportunities`}</Title>
        <Text c="text-secondary">
          {t`Analyze saved questions and models to find common Measures and Segments and compare them with your Library.`}
        </Text>
        <Badge size="lg" variant="light">
          {t`Read-only analysis`}
        </Badge>
      </Stack>
    </Center>
  );
}

function EmptyQueueState({ filtered }: { filtered: boolean }) {
  return (
    <Center h="100%">
      <Stack align="center" ta="center">
        <Icon name={filtered ? "search" : "check"} size={40} />
        <Title order={3}>
          {filtered ? t`No matching tables` : t`Nothing to clean up`}
        </Title>
        <Text c="text-secondary">
          {filtered
            ? t`Try changing or clearing the filters.`
            : t`No Measure or Segment candidates were found in this snapshot.`}
        </Text>
      </Stack>
    </Center>
  );
}
