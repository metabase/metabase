import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
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
import { replace, useParams, useSearchParams } from "metabase/router";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
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
import {
  CleanupFilters,
  CleanupQueueTabs,
} from "../../components/CleanupFilters";
import { useCleanupRefresh } from "../../hooks/useCleanupRefresh";
import { parseCleanupParams } from "../../utils";

import S from "./CleanupTablePage.module.css";

const PAGE_SIZE = 20;

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
      if (params.candidateId === candidate.id) {
        closeCandidate();
      }
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
            flex={params.candidateId != null ? "0 0 50rem" : "1 0 48rem"}
            miw="48rem"
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
                  <Badge
                    color={detail.table.is_published ? "positive" : "neutral"}
                  >
                    {detail.table.is_published ? t`Published` : t`Unpublished`}
                  </Badge>
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
                      value === "measure" || value === "segment"
                        ? value
                        : undefined,
                    page: undefined,
                    candidateId: undefined,
                  })
                }
              >
                <Tabs.List>
                  <Tabs.Tab value="all">{t`All`}</Tabs.Tab>
                  <Tabs.Tab value="measure">{t`Measures`}</Tabs.Tab>
                  <Tabs.Tab value="segment">{t`Segments`}</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </Flex>

            <ScrollArea
              flex={1}
              mih={0}
              type="auto"
              data-testid="cleanup-candidate-list"
            >
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
                <Card withBorder p={0}>
                  <Stack gap={0}>
                    {candidatesQuery.data?.data.map(
                      (candidate, index, rows) => (
                        <CandidateRow
                          key={candidate.id}
                          candidate={candidate}
                          isSelected={params.candidateId === candidate.id}
                          isLast={index === rows.length - 1}
                          isMutating={
                            dismissState.isLoading || restoreState.isLoading
                          }
                          onOpen={() => {
                            trackDataStudioCleanupCandidateInspected(
                              candidate.id,
                              candidate.candidate_type,
                            );
                            updateParams({
                              ...params,
                              candidateId: candidate.id,
                            });
                          }}
                          onDismiss={() => handleDismiss(candidate)}
                        />
                      ),
                    )}
                  </Stack>
                </Card>
              )}
            </ScrollArea>

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

          {params.candidateId != null && (
            <CandidatePanel
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

function CandidateRow({
  candidate,
  isSelected,
  isLast,
  isMutating,
  onOpen,
  onDismiss,
}: {
  candidate: UsageMetadataCandidateSummary;
  isSelected: boolean;
  isLast: boolean;
  isMutating: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <Flex
      className={S.candidateRow}
      data-selected={isSelected || undefined}
      data-testid={`cleanup-candidate-${candidate.id}`}
      align="stretch"
      bd={isLast ? undefined : "0 0 1px 0 solid var(--mb-color-border-neutral)"}
    >
      <UnstyledButton
        aria-label={candidate.display_name}
        p="md"
        flex={1}
        onClick={onOpen}
        style={{
          paddingInlineStart: `${1 + Math.min(candidate.family.depth, 3) * 1.25}rem`,
        }}
      >
        <Flex gap="md" align="center" wrap="nowrap">
          <Icon
            name={getCandidateIcon(candidate)}
            c="text-secondary"
            aria-label={
              candidate.candidate_type === "measure" ? t`Measure` : t`Segment`
            }
          />
          <Stack gap={4} flex={1} miw={0}>
            <Text fw="bold" lineClamp={2}>
              {candidate.display_name}
            </Text>
            <Evidence candidate={candidate} />
          </Stack>
          <Icon name="chevronright" c="text-secondary" />
        </Flex>
      </UnstyledButton>
      <Flex align="center" pr="md">
        {candidate.modeling_status !== "modeled" && !candidate.dismissed && (
          <Tooltip label={t`Dismiss suggestion`}>
            <ActionIcon
              variant="subtle"
              aria-label={t`Dismiss suggestion`}
              disabled={isMutating}
              onClick={(event) => {
                event.stopPropagation();
                onDismiss();
              }}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>
    </Flex>
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
