import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useNavigate, useParams, useSearchParams } from "metabase/router";
import {
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
  TreeTableSkeleton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useDismissUsageMetadataCandidateMutation,
  useRestoreUsageMetadataCandidateMutation,
} from "metabase-enterprise/api";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import { CandidatePanel } from "../../components/CandidatePanel";
import { CandidateTable } from "../../components/CandidateTable";
import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { PublicationStatusBadge } from "../../components/PublicationStatusBadge";
import { useCandidateAction } from "../../hooks/useCandidateAction";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { useUsageMetadataCandidates } from "../../hooks/useUsageMetadataList";
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
  const navigate = useNavigate();
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
  const {
    table,
    isLoading: isTableLoading,
    error: tableError,
  } = useLoadTableWithMetadata(tableId);
  const candidatesQuery = useUsageMetadataCandidates(
    {
      "table-id": tableId,
      "candidate-type": params.candidateType,
      queue: params.queue,
      search: params.search,
    },
    { skip: tableId == null },
  );
  const hasCandidateData = candidatesQuery.data != null;
  const snapshotId = candidatesQuery.data?.snapshot?.id ?? null;

  const scrollToPanel = useCallback((element: HTMLDivElement | null) => {
    element?.scrollIntoView({
      behavior: isCypressActive ? "instant" : "smooth",
      inline: "end",
    });
  }, []);

  const updateParams = (next: Urls.DataStudioCleanupParams) => {
    if (tableId != null) {
      navigate(Urls.dataStudioCleanupTable(tableId, next), { replace: true });
    }
  };

  const closeCandidate = () =>
    updateParams({ ...params, candidateId: undefined });

  const handleStale = () => {
    closeCandidate();
    candidatesQuery.refetch();
    sendErrorToast(
      t`The analysis changed. Review the refreshed candidate before continuing.`,
    );
  };

  const handlePublished = () => {
    setShowPublishModal(false);
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

  const dismissSuggestion = async (
    candidate: UsageMetadataCandidateSummary,
  ) => {
    await runCandidateAction({
      action: "dismiss",
      candidate,
      request: () => dismissCandidate(candidate.id).unwrap(),
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
    if (!hasCandidateData) {
      return;
    }
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
  }, [hasCandidateData, snapshotId]);

  if (tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={new Error(t`Invalid table`)} />
      </Center>
    );
  }

  if (isTableLoading && table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

  if (tableError && table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={tableError} />
      </Center>
    );
  }

  if (table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

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
                  <span>{table.display_name}</span>
                </DataStudioBreadcrumbs>
              }
              title={table.display_name}
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
                  {candidatesQuery.data?.snapshot?.finished_at && (
                    <Text c="text-secondary" size="sm">
                      {t`Analyzed ${dayjs(candidatesQuery.data.snapshot.finished_at).fromNow()}`}
                    </Text>
                  )}
                  <PublicationStatusBadge published={table.is_published} />
                  {!table.is_published && (
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

            {candidatesQuery.isFetching && candidatesQuery.data == null ? (
              <Card withBorder p={0} flex={1} mih={0}>
                <TreeTableSkeleton columnWidths={[0.65, 0.2, 0.1, 0.05]} />
              </Card>
            ) : candidatesQuery.error && candidatesQuery.data == null ? (
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
                aria-busy={candidatesQuery.isFetchingNextPage}
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
                  onDismiss={dismissSuggestion}
                  onScrollEnd={candidatesQuery.fetchNextPage}
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
