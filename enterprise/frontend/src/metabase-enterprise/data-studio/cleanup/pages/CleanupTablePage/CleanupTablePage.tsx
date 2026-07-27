import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { Location } from "history";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  trackDataStudioCleanupCandidateAction,
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
  useDismissUsageMetadataCandidateMutation,
  useGetUsageMetadataTableQuery,
  useListUsageMetadataCandidatesQuery,
  useRestoreUsageMetadataCandidateMutation,
} from "metabase-enterprise/api";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import { getCandidateIcon } from "../../components/CandidateDefinition";
import { CandidateDrawer } from "../../components/CandidateDrawer";
import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { parseCleanupParams } from "../../utils";

const PAGE_SIZE = 20;

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
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const params = parseCleanupParams(location);
  const page = params.page ?? 0;
  const [showPublishModal, setShowPublishModal] = useState(false);
  const previousSnapshotId = useRef<number | null | undefined>(undefined);
  const refresh = useCleanupRefresh();
  const [dismissCandidate, dismissState] =
    useDismissUsageMetadataCandidateMutation();
  const [restoreCandidate, restoreState] =
    useRestoreUsageMetadataCandidateMutation();
  const tableQuery = useGetUsageMetadataTableQuery(tableId ?? 0, {
    skip: tableId == null,
  });
  useLoadTableWithMetadata(tableId);
  const candidatesQuery = useListUsageMetadataCandidatesQuery(
    {
      "table-id": tableId,
      "candidate-type": params.candidateType,
      queue: params.queue,
      search: params.search,
      sort: "priority",
      direction: "asc",
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

  const restoreDismissedCandidate = async (
    candidate: UsageMetadataCandidateSummary,
  ) => {
    try {
      await restoreCandidate(candidate.id).unwrap();
      trackDataStudioCleanupCandidateAction({
        action: "restore",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "success",
      });
      sendSuccessToast(t`Suggestion restored`);
    } catch (error) {
      trackDataStudioCleanupCandidateAction({
        action: "restore",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "failure",
      });
      if (getErrorStatus(error) === 409) {
        handleStale();
      } else {
        sendErrorToast(t`The suggestion could not be restored`);
      }
    }
  };

  const handleDismiss = async (candidate: UsageMetadataCandidateSummary) => {
    try {
      await dismissCandidate({ id: candidate.id }).unwrap();
      trackDataStudioCleanupCandidateAction({
        action: "dismiss",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "success",
      });
      sendSuccessToast(
        t`Suggestion dismissed`,
        () => restoreDismissedCandidate(candidate),
        t`Undo`,
      );
    } catch (error) {
      trackDataStudioCleanupCandidateAction({
        action: "dismiss",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "failure",
      });
      if (getErrorStatus(error) === 409) {
        handleStale();
      } else {
        sendErrorToast(t`The suggestion could not be dismissed`);
      }
    }
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
              <Link to={Urls.dataStudioCleanup({ queue: params.queue })}>
                {t`Cleanup`}
              </Link>
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

        {refresh.isRefreshing && (
          <Card withBorder p="sm">
            <Group>
              <Icon name="sync" />
              <Text>{t`A new instance analysis is running. These results remain available until it finishes.`}</Text>
            </Group>
          </Card>
        )}

        <CleanupQueueTabs params={params} onChange={updateParams} />

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
          showDatabaseFilter={false}
          searchPlaceholder={t`Search suggestions`}
        />

        {!candidatesQuery.isLoading && candidatesQuery.data && (
          <Group justify="space-between">
            <Stack gap={0}>
              <Text fw="bold">{getQueueHeading(params.queue)}</Text>
              <Text c="text-secondary" size="sm">
                {getQueueDescription(params.queue)}
              </Text>
            </Stack>
            <Text c="text-secondary" size="sm">
              {t`Showing ${Math.min(
                candidatesQuery.data.total,
                page * PAGE_SIZE + 1,
              )}–${Math.min(
                candidatesQuery.data.total,
                (page + 1) * PAGE_SIZE,
              )} of ${candidatesQuery.data.total}`}
            </Text>
          </Group>
        )}

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
                isMutating={dismissState.isLoading || restoreState.isLoading}
                onOpen={() => {
                  trackDataStudioCleanupCandidateInspected(
                    candidate.id,
                    candidate.candidate_type,
                  );
                  updateParams({ ...params, candidateId: candidate.id });
                }}
                onDismiss={() => handleDismiss(candidate)}
                onRestore={() => restoreDismissedCandidate(candidate)}
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
  isMutating,
  onOpen,
  onDismiss,
  onRestore,
}: {
  candidate: UsageMetadataCandidateSummary;
  isMutating: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onRestore: () => void;
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
    <Card withBorder p="md" data-testid={`cleanup-candidate-${candidate.id}`}>
      <Flex gap="lg" align="center" wrap="nowrap">
        <Icon
          name={getCandidateIcon(candidate)}
          c="text-secondary"
          aria-label={
            candidate.candidate_type === "measure" ? t`Measure` : t`Segment`
          }
        />
        <Stack gap="xs" flex={1} miw={0}>
          <Text fw="bold">{candidate.suggested_name}</Text>
          <Evidence candidate={candidate} />
        </Stack>
        <Group gap="xs" wrap="nowrap">
          {candidate.dismissed ? (
            <Button variant="outline" loading={isMutating} onClick={onRestore}>
              {t`Restore`}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onOpen}>
                {actionLabel}
              </Button>
              <Button
                aria-label={t`Dismiss suggestion`}
                variant="subtle"
                leftSection={<Icon name="close" />}
                disabled={isMutating}
                onClick={onDismiss}
              >
                {t`Dismiss`}
              </Button>
            </>
          )}
        </Group>
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

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error != null && "status" in error
    ? error.status
    : undefined;
}

function getQueueHeading(queue: Urls.DataStudioCleanupParams["queue"]) {
  switch (queue) {
    case "review":
      return t`Definitions to review`;
    case "all":
      return t`All suggestions`;
    case "dismissed":
      return t`Dismissed suggestions`;
    default:
      return t`Recommended next`;
  }
}

function getQueueDescription(queue: Urls.DataStudioCleanupParams["queue"]) {
  switch (queue) {
    case "review":
      return t`These definitions differ from related entities in the Library.`;
    case "all":
      return t`Browse the complete analysis for this table.`;
    case "dismissed":
      return t`Restore a suggestion if it should return to the cleanup queue.`;
    default:
      return t`Start with the most actionable, strongly supported suggestions.`;
  }
}
