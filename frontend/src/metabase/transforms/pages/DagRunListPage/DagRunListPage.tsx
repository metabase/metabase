import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import type { Location } from "history";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { useCancelDagRunMutation, useListAllDagRunsQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { formatRunMethod, formatStatus } from "metabase/transforms/utils";
import { Center, Flex, Group, Select, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  TRANSFORM_JOB_RUN_STATUSES,
  TRANSFORM_RUN_METHODS,
  type TransformDagRun,
  type TransformJobRunId,
  type TransformJobRunStatus,
  type TransformRunMethod,
} from "metabase-types/api";

import { isPollingNeeded } from "../JobRunListPage/JobRunListPage";
import { JobRunSidebar } from "../JobRunListPage/JobRunSidebar";
import { JobRunTable } from "../JobRunListPage/JobRunTable";
import { PAGE_SIZE } from "../JobRunListPage/constants";
import type { JobRunSortOptions } from "../JobRunListPage/types";
import { getParsedParams, getSortOptions } from "../JobRunListPage/utils";

import S from "./DagRunListPage.module.css";
import { getDagRunLeadingColumns } from "./columns";

const EMPTY_RUNS: TransformDagRun[] = [];

type DagRunListPageProps = {
  location: Location;
};

export function DagRunListPage({ location }: DagRunListPageProps) {
  usePageTitle(t`Manual DAG runs`);
  const parsedParams = getParsedParams(location);
  const { page = 0 } = parsedParams;
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRunId, setSelectedRunId] = useState<
    TransformJobRunId | undefined
  >();
  const [isPolling, setIsPolling] = useState(false);
  const [
    isCancelModalOpen,
    { open: openCancelModal, close: closeCancelModal },
  ] = useDisclosure();
  const dispatch = useDispatch();
  const [cancelDagRun] = useCancelDagRunMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const { data, isLoading, error } = useListAllDagRunsQuery(
    {
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      status: parsedParams.status,
      "run-method": parsedParams.runMethod,
      "start-time": parsedParams.startTime,
      "sort-column": parsedParams.sortColumn,
      "sort-direction": parsedParams.sortDirection,
    },
    { pollingInterval: isPolling ? POLLING_INTERVAL : undefined },
  );

  if (isPolling !== isPollingNeeded(data?.data)) {
    setIsPolling(isPollingNeeded(data?.data));
  }

  const runs = data?.data ?? EMPTY_RUNS;
  const leadingColumns = useMemo(() => getDagRunLeadingColumns(), []);

  const selectedRun = useMemo(
    () =>
      selectedRunId != null
        ? runs.find((run) => run.id === selectedRunId)
        : undefined,
    [selectedRunId, runs],
  );

  useLayoutEffect(() => {
    if (selectedRunId != null && selectedRun == null) {
      setSelectedRunId(undefined);
    }
  }, [selectedRunId, selectedRun]);

  const handleParamsChange = useCallback(
    (newParams: Urls.TransformJobRunListParams) => {
      dispatch(replace(Urls.transformManualDagRuns(newParams)));
    },
    [dispatch],
  );

  const handleStatusChange = useCallback(
    (status: TransformJobRunStatus | undefined) => {
      handleParamsChange({ ...parsedParams, status, page: undefined });
    },
    [parsedParams, handleParamsChange],
  );

  const handleRunMethodChange = useCallback(
    (runMethod: TransformRunMethod | undefined) => {
      handleParamsChange({ ...parsedParams, runMethod, page: undefined });
    },
    [parsedParams, handleParamsChange],
  );

  const handleStartTimeChange = useCallback(
    (startTime: string | undefined) => {
      handleParamsChange({ ...parsedParams, startTime, page: undefined });
    },
    [parsedParams, handleParamsChange],
  );

  const handleSortOptionsChange = useCallback(
    (sortOptions: JobRunSortOptions | undefined) => {
      handleParamsChange({
        ...parsedParams,
        sortColumn: sortOptions?.column,
        sortDirection: sortOptions?.direction,
        page: undefined,
      });
    },
    [parsedParams, handleParamsChange],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      handleParamsChange({ ...parsedParams, page: nextPage });
    },
    [parsedParams, handleParamsChange],
  );

  const handleSelect = useCallback((runId: TransformJobRunId) => {
    setSelectedRunId(runId);
  }, []);

  const handleCancelRun = async () => {
    closeCancelModal();
    if (selectedRun == null) {
      return;
    }
    const { error } = await cancelDagRun(selectedRun.id);
    if (error) {
      sendErrorToast(t`Failed to cancel run`);
    } else {
      sendSuccessToast(t`Canceling run`);
    }
  };

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="dag-run-list"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap={0}>
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Manual DAG runs`}</DataStudioBreadcrumbs>
          }
          py={0}
          showMetabotButton
        />
        {isLoading || error != null ? (
          <Center h="100%">
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <Stack flex="0 1 auto" mih={0} gap="lg" pt="2.5rem">
            <Group>
              <Select
                data={getStatusOptions()}
                value={parsedParams.status ?? null}
                placeholder={t`All statuses`}
                clearable
                w={180}
                aria-label={t`Status`}
                onChange={(value) =>
                  handleStatusChange(
                    Urls.parseEnumParam(value, TRANSFORM_JOB_RUN_STATUSES),
                  )
                }
              />
              <Select
                data={getRunMethodOptions()}
                value={parsedParams.runMethod ?? null}
                placeholder={t`All triggers`}
                clearable
                w={180}
                aria-label={t`Trigger`}
                onChange={(value) =>
                  handleRunMethodChange(
                    Urls.parseEnumParam(value, TRANSFORM_RUN_METHODS),
                  )
                }
              />
              <Select
                data={getStartTimeOptions()}
                value={parsedParams.startTime ?? null}
                placeholder={t`Any time`}
                clearable
                w={180}
                aria-label={t`Started at`}
                onChange={(value) => handleStartTimeChange(value ?? undefined)}
              />
            </Group>
            <JobRunTable<TransformDagRun>
              runs={runs}
              leadingColumns={leadingColumns}
              ariaLabel={t`Manual DAG runs`}
              hasFilters={
                parsedParams.status != null ||
                parsedParams.runMethod != null ||
                parsedParams.startTime != null
              }
              sortOptions={getSortOptions(parsedParams)}
              onSortOptionsChange={handleSortOptionsChange}
              onSelect={handleSelect}
            />
            {data != null && data.total > PAGE_SIZE && (
              <Group justify="end">
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  itemsLength={runs.length}
                  total={data.total}
                  showTotal
                  onPreviousPage={() => handlePageChange(page - 1)}
                  onNextPage={() => handlePageChange(page + 1)}
                />
              </Group>
            )}
          </Stack>
        )}
      </Stack>
      {selectedRun != null && (
        <JobRunSidebar
          sourceTransformId={selectedRun.source_transform_id}
          run={selectedRun}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedRunId(undefined)}
          onCancel={openCancelModal}
        />
      )}
      <ConfirmModal
        title={t`Cancel this run?`}
        message={t`This stops the run and cancels any transforms still in progress. Transforms that already finished keep their results.`}
        opened={isCancelModalOpen}
        onClose={closeCancelModal}
        onConfirm={handleCancelRun}
        confirmButtonText={t`Cancel run`}
        closeButtonText={t`Keep running`}
      />
    </Flex>
  );
}

function getStatusOptions() {
  return TRANSFORM_JOB_RUN_STATUSES.map((status) => ({
    value: status,
    label: formatStatus(status),
  }));
}

function getRunMethodOptions() {
  return TRANSFORM_RUN_METHODS.map((runMethod) => ({
    value: runMethod,
    label: formatRunMethod(runMethod),
  }));
}

function getStartTimeOptions() {
  return [
    { value: "thisday", label: t`Today` },
    { value: "past1days", label: t`Yesterday` },
    { value: "past1weeks", label: t`Previous week` },
    { value: "past7days", label: t`Previous 7 days` },
    { value: "past30days", label: t`Previous 30 days` },
    { value: "past1months", label: t`Previous month` },
    { value: "past3months", label: t`Previous 3 months` },
    { value: "past12months", label: t`Previous 12 months` },
  ];
}
