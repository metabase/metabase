import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  trackDataStudioCleanupCandidateInspected,
  trackDataStudioCleanupPublicationStarted,
} from "metabase/common/data-studio/analytics";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { isCypressActive } from "metabase/env";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { replace, useParams, useSearchParams } from "metabase/router";
import {
  ActionIcon,
  Box,
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
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
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
import { CandidatePanel } from "../../components/CandidatePanel";
import { CandidatePills } from "../../components/CandidatePills";
import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { EvidenceBadges } from "../../components/EvidenceBadges";
import { PublicationStatusBadge } from "../../components/PublicationStatusBadge";
import { useCandidateAction } from "../../hooks/useCandidateAction";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { parseCleanupParams } from "../../utils";

import S from "./CleanupTablePage.module.css";

dayjs.extend(relativeTime);

type CleanupTablePageParams = {
  tableId: string;
};

export function CleanupTablePage() {
  const routeParams = useParams<CleanupTablePageParams>();
  const [searchParams] = useSearchParams();
  const tableId = Urls.extractEntityId(routeParams.tableId);
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const params = parseCleanupParams(searchParams);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const previousSnapshotId = useRef<number | null | undefined>(undefined);
  const refresh = useCleanupRefresh();
  const [dismissCandidate, dismissState] =
    useDismissUsageMetadataCandidateMutation();
  const [restoreCandidate, restoreState] =
    useRestoreUsageMetadataCandidateMutation();
  const runCandidateAction = useCandidateAction();
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
    },
    { skip: tableId == null },
  );
  const snapshotId = candidatesQuery.data?.snapshot?.id ?? null;

  const scrollToPanel = useCallback((element: HTMLDivElement | null) => {
    element?.scrollIntoView({
      behavior: isCypressActive ? "instant" : "smooth",
      inline: "end",
    });
  }, []);

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
    await runCandidateAction({
      action: "restore",
      candidate,
      request: () => restoreCandidate(candidate.id).unwrap(),
      errorMessage: t`The suggestion could not be restored`,
      onStale: handleStale,
      onSuccess: () => sendSuccessToast(t`Suggestion restored`),
    });
  };

  const handleDismiss = async (candidate: UsageMetadataCandidateSummary) => {
    await runCandidateAction({
      action: "dismiss",
      candidate,
      request: () => dismissCandidate({ id: candidate.id }).unwrap(),
      errorMessage: t`The suggestion could not be dismissed`,
      onStale: handleStale,
      onSuccess: () => {
        if (params.candidateId === candidate.id) {
          closeCandidate();
        }
        sendSuccessToast(
          t`Suggestion dismissed`,
          () => restoreDismissedCandidate(candidate),
          t`Undo`,
        );
      },
    });
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
    // the current render so a completed refresh closes an obsolete report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotId]);

  if (tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={new Error(t`Invalid table`)} />
      </Center>
    );
  }

  if (tableQuery.isFetching || tableQuery.error || !tableQuery.data) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={tableQuery.isFetching}
          error={tableQuery.error}
        />
      </Center>
    );
  }

  const detail = tableQuery.data;

  return (
    <>
      <SectionLayout>
        <Flex
          h="100%"
          mih={0}
          miw={0}
          className={S.workspace}
          data-testid="cleanup-table-workspace"
        >
          <PageContainer
            data-testid="cleanup-table-page"
            flex="6 1 0"
            miw={800}
            maw="100%"
            px="xl"
            pb="md"
            gap="md"
            mih={0}
            style={{ overflow: "hidden" }}
          >
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
              tabs={
                <CleanupQueueTabs
                  params={params}
                  onChange={updateParams}
                  variant="pills"
                />
              }
              actions={
                <Group>
                  {detail.snapshot?.finished_at && (
                    <Text c="text-secondary" size="sm">
                      {t`Analyzed ${dayjs(detail.snapshot.finished_at).fromNow()}`}
                    </Text>
                  )}
                  <PublicationStatusBadge
                    published={detail.table.is_published}
                  />
                  {!detail.table.is_published && (
                    <Button
                      onClick={() => {
                        trackDataStudioCleanupPublicationStarted(
                          Number(tableId),
                        );
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

            <Flex gap="sm" align="center" wrap="nowrap">
              <Box flex={1}>
                <CleanupFilters
                  params={params}
                  onChange={updateParams}
                  showDatabaseFilter={false}
                  searchPlaceholder={
                    params.queue === "used-raw"
                      ? t`Search raw usage`
                      : t`Search suggestions`
                  }
                />
              </Box>
              <Tabs
                variant="pills"
                value={params.candidateType ?? "all"}
                onChange={(value) =>
                  updateParams({
                    ...params,
                    candidateType:
                      value === "table" ||
                      value === "metric" ||
                      value === "measure" ||
                      value === "segment"
                        ? value
                        : undefined,
                    candidateId: undefined,
                  })
                }
              >
                <Tabs.List>
                  <Tabs.Tab value="all">{t`All`}</Tabs.Tab>
                  <Tabs.Tab value="table">{t`Tables`}</Tabs.Tab>
                  <Tabs.Tab value="metric">{t`Metrics`}</Tabs.Tab>
                  <Tabs.Tab value="measure">{t`Measures`}</Tabs.Tab>
                  <Tabs.Tab value="segment">{t`Segments`}</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </Flex>

            {candidatesQuery.isFetching ? (
              <Card withBorder p={0} flex={1} mih={0}>
                <TreeTableSkeleton columnWidths={[0.65, 0.2, 0.1, 0.05]} />
              </Card>
            ) : candidatesQuery.error ? (
              <Center mih="16rem" flex={1}>
                <LoadingAndErrorWrapper error={candidatesQuery.error} />
              </Center>
            ) : candidatesQuery.data?.data.length === 0 ? (
              <Center mih="16rem" flex={1}>
                <Stack align="center">
                  <Icon name="search" size={36} />
                  <Title order={3}>{t`No matching candidates`}</Title>
                  <Text c="text-secondary">{t`Try changing the filters.`}</Text>
                </Stack>
              </Center>
            ) : (
              <Card
                withBorder
                p={0}
                flex={1}
                mih={0}
                style={{ overflow: "hidden" }}
                data-testid="cleanup-candidate-list"
              >
                <CandidateTable
                  candidates={candidatesQuery.data?.data ?? []}
                  selectedCandidateId={params.candidateId}
                  isMutating={dismissState.isLoading || restoreState.isLoading}
                  onOpen={(candidate) => {
                    trackDataStudioCleanupCandidateInspected(
                      candidate.id,
                      candidate.candidate_type,
                    );
                    updateParams({
                      ...params,
                      candidateId: candidate.id,
                    });
                  }}
                  onDismiss={handleDismiss}
                />
              </Card>
            )}
          </PageContainer>

          {params.candidateId != null && (
            <CandidatePanel
              panelRef={scrollToPanel}
              candidateId={params.candidateId}
              onClose={closeCandidate}
              onStale={handleStale}
              onTablePublished={handlePublished}
            />
          )}
        </Flex>
      </SectionLayout>
      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={showPublishModal}
        tableIds={[tableId]}
        onPublish={handlePublished}
        onClose={() => setShowPublishModal(false)}
      />
    </>
  );
}

function CandidateTable({
  candidates,
  selectedCandidateId,
  isMutating,
  onOpen,
  onDismiss,
}: {
  candidates: UsageMetadataCandidateSummary[];
  selectedCandidateId?: number;
  isMutating: boolean;
  onOpen: (candidate: UsageMetadataCandidateSummary) => void;
  onDismiss: (candidate: UsageMetadataCandidateSummary) => void;
}) {
  const columns = useMemo<TreeTableColumnDef<UsageMetadataCandidateSummary>[]>(
    () => [
      {
        id: "recommendation",
        header: t`Recommendation`,
        minWidth: 460,
        cell: ({ row }) => {
          const candidate = row.original;
          return (
            <Group
              gap="sm"
              wrap="nowrap"
              miw={0}
              w="100%"
              data-testid={`cleanup-candidate-content-${candidate.id}`}
            >
              <Icon
                name={getCandidateIcon(candidate)}
                c="text-secondary"
                aria-label={getCandidateTypeLabel(candidate.candidate_type)}
              />
              {candidate.candidate_type === "measure" ||
              candidate.candidate_type === "segment" ? (
                <CandidatePills
                  candidateType={candidate.candidate_type}
                  presentation={candidate.presentation}
                />
              ) : (
                <Text fw="bold" truncate>
                  {candidate.display_name}
                </Text>
              )}
            </Group>
          );
        },
      },
      {
        id: "signals",
        header: t`Signals`,
        width: 210,
        cell: ({ row }) => <CandidateSignals candidate={row.original} />,
      },
      {
        id: "sources",
        header: t`Used by`,
        width: 100,
        cell: ({ row }) => (
          <Text c="text-secondary">
            {t`${row.original.evidence.distinct_source_count} sources`}
          </Text>
        ),
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => {
          const candidate = row.original;
          if (candidate.modeling_status === "modeled" || candidate.dismissed) {
            return null;
          }
          return (
            <Tooltip label={t`Dismiss suggestion`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Dismiss suggestion`}
                disabled={isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onDismiss(candidate);
                }}
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          );
        },
      },
    ],
    [isMutating, onDismiss],
  );
  const treeTableInstance = useTreeTableInstance({
    data: candidates,
    columns,
    getNodeId: (candidate) => String(candidate.id),
    selectedRowId:
      selectedCandidateId == null ? null : String(selectedCandidateId),
    defaultRowHeight: 52,
    onRowActivate: (row) => onOpen(row.original),
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      hierarchical={false}
      ariaLabel={t`Cleanup recommendations`}
      styles={{
        row: { height: "auto", minHeight: "3.25rem" },
        cell: { whiteSpace: "normal" },
      }}
      getRowProps={(row) => ({
        "data-testid": `cleanup-candidate-${row.original.id}`,
        "data-selected": row.original.id === selectedCandidateId || undefined,
        "aria-label": row.original.display_name,
      })}
      onRowClick={(row) => onOpen(row.original)}
    />
  );
}

function getCandidateTypeLabel(
  candidateType: UsageMetadataCandidateSummary["candidate_type"],
) {
  switch (candidateType) {
    case "table":
      return t`Table`;
    case "metric":
      return t`Metric`;
    case "measure":
      return t`Measure`;
    case "segment":
      return t`Segment`;
  }
}

function CandidateSignals({
  candidate,
}: {
  candidate: UsageMetadataCandidateSummary;
}) {
  const { evidence } = candidate;
  return (
    <EvidenceBadges
      verified={evidence.verified_source_count > 0}
      official={evidence.official_source_count > 0}
      popular={evidence.popular_source_count > 0}
    />
  );
}
