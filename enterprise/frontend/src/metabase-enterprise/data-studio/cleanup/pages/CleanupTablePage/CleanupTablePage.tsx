import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { Location } from "history";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  trackDataStudioCleanupCandidateInspected,
  trackDataStudioCleanupPublicationStarted,
} from "metabase/common/data-studio/analytics";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { replace } from "metabase/router";
import {
  Badge,
  Button,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  usageMetadataApi,
  useGetUsageMetadataTableQuery,
  useListUsageMetadataCandidatesQuery,
} from "metabase-enterprise/api";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import {
  CandidateDefinition,
  getCandidateIcon,
} from "../../components/CandidateDefinition";
import { CandidateDrawer } from "../../components/CandidateDrawer";
import { CleanupFilters } from "../../components/CleanupFilters";
import { ModelingStatusBadge } from "../../components/ModelingStatusBadge";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { parseCleanupParams } from "../../utils";

const PAGE_SIZE = 50;

dayjs.extend(relativeTime);

type CleanupTablePageProps = {
  location: Location;
  params: { tableId: string };
};

export function CleanupTablePage({
  location,
  params: routeParams,
}: CleanupTablePageProps) {
  const tableId = Urls.extractEntityId(routeParams.tableId);
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();
  const params = parseCleanupParams(location);
  const page = params.page ?? 0;
  const [showPublishModal, setShowPublishModal] = useState(false);
  const previousSnapshotId = useRef<number | null | undefined>(undefined);
  const refresh = useCleanupRefresh();
  const tableQuery = useGetUsageMetadataTableQuery(tableId ?? 0, {
    skip: tableId == null,
  });
  useLoadTableWithMetadata(tableId);
  const candidatesQuery = useListUsageMetadataCandidatesQuery(
    {
      "table-id": tableId,
      "candidate-type": params.candidateType,
      "modeling-status": params.modelingStatus,
      signal: params.signal,
      dismissed: params.dismissed,
      search: params.search,
      sort: params.sort,
      direction: params.direction,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { skip: tableId == null },
  );
  const snapshotId = candidatesQuery.data?.snapshot?.id ?? null;

  const updateParams = (next: Urls.DataStudioCleanupParams) => {
    if (tableId != null) {
      dispatch(replace(Urls.dataStudioCleanupTable(tableId, next)));
    }
  };

  const closeCandidate = () =>
    updateParams({ ...params, candidateId: undefined });

  const handleStale = () => {
    closeCandidate();
    candidatesQuery.refetch();
    tableQuery.refetch();
    sendErrorToast(
      t`The analysis changed. Review the refreshed candidate before continuing.`,
    );
  };

  const handlePublished = () => {
    setShowPublishModal(false);
    dispatch(
      usageMetadataApi.util.invalidateTags([
        { type: "usage-metadata-candidate", id: "LIST" },
        { type: "usage-metadata-candidate", id: `table-${tableId}` },
      ]),
    );
    tableQuery.refetch();
    candidatesQuery.refetch();
  };

  useEffect(() => {
    if (
      previousSnapshotId.current !== undefined &&
      previousSnapshotId.current !== snapshotId &&
      params.candidateId != null
    ) {
      closeCandidate();
    }
    previousSnapshotId.current = snapshotId;
    // Only react to the snapshot identity; params are intentionally read from
    // the current render so a completed refresh closes an obsolete drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotId]);

  if (tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={new Error(t`Invalid table`)} />
      </Center>
    );
  }

  if (tableQuery.isLoading || tableQuery.error || !tableQuery.data) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={tableQuery.isLoading}
          error={tableQuery.error}
        />
      </Center>
    );
  }

  const detail = tableQuery.data;

  return (
    <SectionLayout>
      <PageContainer data-testid="cleanup-table-page">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataStudioCleanup()}>{t`Cleanup`}</Link>
              <span>{detail.table.display_name}</span>
            </DataStudioBreadcrumbs>
          }
          title={detail.table.display_name}
          icon="table"
          actions={
            <Group>
              {detail.snapshot?.finished_at && (
                <Text c="text-secondary" size="sm">
                  {t`Analyzed ${dayjs(detail.snapshot.finished_at).fromNow()}`}
                </Text>
              )}
              <Badge color={detail.table.is_published ? "positive" : "neutral"}>
                {detail.table.is_published ? t`Published` : t`Unpublished`}
              </Badge>
              {!detail.table.is_published && (
                <Button
                  onClick={() => {
                    trackDataStudioCleanupPublicationStarted(Number(tableId));
                    setShowPublishModal(true);
                  }}
                >
                  {t`Publish table`}
                </Button>
              )}
            </Group>
          }
          py={0}
        />

        <Flex gap="xl" wrap="wrap">
          <SummaryStat
            label={t`Active candidates`}
            value={detail.candidate_count}
          />
          <SummaryStat
            label={t`Dismissed candidates`}
            value={detail.dismissed_count}
          />
          <SummaryStat
            label={t`Measures`}
            value={sumCounts(detail.counts.measure)}
          />
          <SummaryStat
            label={t`Segments`}
            value={sumCounts(detail.counts.segment)}
          />
        </Flex>

        {refresh.isRefreshing && (
          <Card withBorder p="sm">
            <Group>
              <Icon name="sync" />
              <Text>{t`A new instance analysis is running. These results remain available until it finishes.`}</Text>
            </Group>
          </Card>
        )}

        <Tabs
          value={params.candidateType ?? "all"}
          onChange={(value) =>
            updateParams({
              ...params,
              candidateType:
                value === "measure" || value === "segment" ? value : undefined,
              page: undefined,
              candidateId: undefined,
            })
          }
        >
          <Tabs.List>
            <Tabs.Tab value="all">{t`All candidates`}</Tabs.Tab>
            <Tabs.Tab value="measure">{t`Measures`}</Tabs.Tab>
            <Tabs.Tab value="segment">{t`Segments`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <CleanupFilters
          params={params}
          onChange={updateParams}
          showLocationFilters={false}
          showSort
        />

        {candidatesQuery.isLoading ? (
          <Center mih="16rem">
            <LoadingAndErrorWrapper loading />
          </Center>
        ) : candidatesQuery.error ? (
          <Center mih="16rem">
            <LoadingAndErrorWrapper error={candidatesQuery.error} />
          </Center>
        ) : candidatesQuery.data?.data.length === 0 ? (
          <Center mih="16rem">
            <Stack align="center">
              <Icon name="search" size={36} />
              <Title order={3}>{t`No matching candidates`}</Title>
              <Text c="text-secondary">{t`Try changing the filters.`}</Text>
            </Stack>
          </Center>
        ) : (
          <Stack gap="sm">
            {candidatesQuery.data?.data.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                onOpen={() => {
                  trackDataStudioCleanupCandidateInspected(
                    candidate.id,
                    candidate.candidate_type,
                  );
                  updateParams({ ...params, candidateId: candidate.id });
                }}
              />
            ))}
          </Stack>
        )}

        {candidatesQuery.data && candidatesQuery.data.data.length > 0 && (
          <Flex justify="flex-end">
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={candidatesQuery.data.data.length}
              total={candidatesQuery.data.total}
              showTotal
              onPreviousPage={() =>
                updateParams({
                  ...params,
                  page: Math.max(0, page - 1),
                  candidateId: undefined,
                })
              }
              onNextPage={() =>
                updateParams({
                  ...params,
                  page: page + 1,
                  candidateId: undefined,
                })
              }
            />
          </Flex>
        )}
      </PageContainer>

      <CandidateDrawer
        candidateId={params.candidateId}
        onClose={closeCandidate}
        onStale={handleStale}
        onTablePublished={handlePublished}
      />

      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={showPublishModal}
        tableIds={[tableId]}
        onPublish={handlePublished}
        onClose={() => setShowPublishModal(false)}
      />
    </SectionLayout>
  );
}

function CandidateRow({
  candidate,
  onOpen,
}: {
  candidate: UsageMetadataCandidateSummary;
  onOpen: () => void;
}) {
  const actionLabel =
    candidate.modeling_status === "modeled"
      ? t`View details`
      : candidate.modeling_status === "partially-modeled"
        ? t`Review`
        : candidate.creation_blockers.includes("table-not-published")
          ? t`Publish and create`
          : candidate.candidate_type === "measure"
            ? t`Create Measure`
            : t`Create Segment`;

  return (
    <Card withBorder p="lg" data-testid={`cleanup-candidate-${candidate.id}`}>
      <Flex gap="lg" align="center" wrap="nowrap">
        <Icon name={getCandidateIcon(candidate)} size={24} />
        <Stack gap="xs" flex={1} miw={0}>
          <Group gap="sm">
            <Text fw="bold">{candidate.suggested_name}</Text>
            <ModelingStatusBadge status={candidate.modeling_status} />
            {candidate.dismissed && (
              <Badge color="neutral">{t`Dismissed`}</Badge>
            )}
          </Group>
          <Text c="text-secondary" size="sm">
            {candidate.suggested_description}
          </Text>
          <CandidateDefinition candidate={candidate} />
          <Evidence candidate={candidate} />
        </Stack>
        <Button variant="outline" onClick={onOpen}>
          {candidate.dismissed ? t`Review dismissal` : actionLabel}
        </Button>
      </Flex>
    </Card>
  );
}

function Evidence({ candidate }: { candidate: UsageMetadataCandidateSummary }) {
  const { evidence } = candidate;
  return (
    <Group gap="xs">
      {evidence.verified_source_count > 0 && (
        <Badge variant="light">{t`Verified`}</Badge>
      )}
      {evidence.official_source_count > 0 && (
        <Badge variant="light">{t`Official`}</Badge>
      )}
      {evidence.popular_source_count > 0 && (
        <Badge variant="light">{t`Popular`}</Badge>
      )}
      <Text size="xs" c="text-secondary">
        {t`${evidence.distinct_source_count} sources · ${evidence.total_view_count} views`}
      </Text>
    </Group>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <Stack gap={0}>
      <Text size="xl" fw="bold">
        {value}
      </Text>
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
    </Stack>
  );
}

function sumCounts(
  counts: Record<"missing" | "partially-modeled" | "modeled", number>,
) {
  return counts.missing + counts["partially-modeled"] + counts.modeled;
}
