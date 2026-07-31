import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { trackDataStudioCleanupTableSelected } from "metabase/common/data-studio/analytics";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useDispatch } from "metabase/redux";
import { replace, useSearchParams } from "metabase/router";
import {
  Badge,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListUsageMetadataTablesQuery } from "metabase-enterprise/api";
import type { UsageMetadataTableSummary } from "metabase-types/api";

import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { CleanupHeader } from "../../components/CleanupHeader";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { hasActiveFilters, parseCleanupParams } from "../../utils";

import S from "./CleanupPage.module.css";

const PAGE_SIZE = 50;

export function CleanupPage() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const params = parseCleanupParams(searchParams);
  const page = params.page ?? 0;
  const refresh = useCleanupRefresh();
  const query = useListUsageMetadataTablesQuery({
    "database-id": params.databaseId,
    queue: params.queue,
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
        <ScrollArea
          flex={1}
          mih={0}
          type="auto"
          data-testid="cleanup-table-list"
        >
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
            <EmptyQueueState
              filtered={hasActiveFilters(params)}
              queue={params.queue}
            />
          ) : (
            <Card withBorder p={0}>
              {query.data?.data.map((row, index, rows) => (
                <CleanupTableRow
                  key={String(row.table.id)}
                  row={row}
                  params={params}
                  isLast={index === rows.length - 1}
                />
              ))}
            </Card>
          )}
        </ScrollArea>
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
  isLast,
}: {
  row: UsageMetadataTableSummary;
  params: Urls.DataStudioCleanupParams;
  isLast: boolean;
}) {
  const { table, candidate_count: candidateCount } = row;

  return (
    <Card
      component={Link}
      to={Urls.dataStudioCleanupTable(table.id, {
        queue: params.queue,
      })}
      className={S.tableRow}
      p="md"
      radius={0}
      shadow="none"
      bd={isLast ? undefined : "0 0 1px 0 solid var(--mb-color-border-neutral)"}
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
        <Stack gap={0} align="flex-end" miw="7rem">
          <Text fw="bold">{candidateCount}</Text>
          <Text c="text-secondary" size="xs">
            {getQueueCountLabel(params.queue)}
          </Text>
        </Stack>
        <Icon name="chevronright" />
      </Flex>
    </Card>
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
      return t`suggestions`;
    case "used-raw":
      return t`used raw`;
    case "discarded":
      return t`discarded`;
  }
}
