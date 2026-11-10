import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useLocation, useNavigate } from "metabase/router";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { Flex, Group, Stack } from "metabase/ui";
import type * as Urls from "metabase/urls";
import { useListDataTestRunsQuery } from "metabase-enterprise/api";
import type {
  DataTestId,
  DataTestRunId,
  DataTestRunWithUser,
  DataTestType,
} from "metabase-types/api";

import { PAGE_SIZE } from "../../constants";
import { getDataTestTypeDefinition } from "../../test-types";
import { getRunDataTestCacheKey } from "../../utils";
import { DataTestRunButton } from "../DataTestRunButton";

import { DataTestRunFilterBar } from "./DataTestRunFilterBar";
import { DataTestRunSidebar } from "./DataTestRunSidebar";
import { DataTestRunTable } from "./DataTestRunTable";
import S from "./DataTestRuns.module.css";
import { getParsedParams } from "./utils";

const EMPTY_RUNS: DataTestRunWithUser[] = [];

type DataTestRunsProps<K extends DataTestType> = {
  testType: K;
  testId: DataTestId;
};

/**
 * The run history of one test: filters, a paginated table of runs, and a
 * sidebar with the selected run.
 */
export function DataTestRuns<K extends DataTestType>({
  testType,
  testId,
}: DataTestRunsProps<K>) {
  const definition = getDataTestTypeDefinition(testType);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = definition.useGetTestQuery(testId);
  const {
    readOnly,
    isLoading: isLoadingReadOnly,
    error: readOnlyError,
  } = definition.useReadOnly(
    test != null ? definition.getSubjectId(test) : skipToken,
  );
  const [, { isLoading: isRunning }] = definition.useRunTestMutation({
    fixedCacheKey: getRunDataTestCacheKey(testType, testId),
  });
  const location = useLocation();
  const navigate = useNavigate();
  const params = getParsedParams(location);
  const { page = 0 } = params;
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRunId, setSelectedRunId] = useState<DataTestRunId>();
  const [isPolling, setIsPolling] = useState(false);

  const { data, isLoading, error } = useListDataTestRunsQuery(
    {
      "test-type": testType,
      "test-id": testId,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      statuses: params.statuses,
      "start-time": params.startTime,
      "end-time": params.endTime,
    },
    { pollingInterval: isPolling ? POLLING_INTERVAL : undefined },
  );
  const runs = data?.data ?? EMPTY_RUNS;
  const selectedRun = runs.find((run) => run.id === selectedRunId);
  const hasFilters =
    params.statuses != null ||
    params.startTime != null ||
    params.endTime != null;

  const shouldPoll = isRunning || runs.some((run) => run.status === "started");
  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  if (test == null || isLoadingTest || isLoadingReadOnly) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingTest || isLoadingReadOnly}
        error={testError ?? readOnlyError}
      />
    );
  }

  const { SubjectLink } = definition;

  const handleFilterOptionsChange = (
    filterOptions: Omit<Urls.DataTestRunListParams, "page">,
  ) => {
    navigate(definition.getTestRunsUrl(test, filterOptions), {
      replace: true,
    });
  };

  const handlePageChange = (page: number) => {
    navigate(definition.getTestRunsUrl(test, { ...params, page }), {
      replace: true,
    });
  };

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      flex={1}
      mih={0}
      gap="lg"
      wrap="nowrap"
      data-testid="data-test-runs"
    >
      <Stack className={S.main} flex={1} gap="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <DataTestRunFilterBar
            filterOptions={{
              statuses: params.statuses,
              startTime: params.startTime,
              endTime: params.endTime,
            }}
            onFilterOptionsChange={handleFilterOptionsChange}
          />
          <DataTestRunButton
            testType={testType}
            test={test}
            readOnly={readOnly}
            triggeredFrom="test_runs"
          />
        </Group>
        {data == null || isLoading || error != null ? (
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        ) : (
          <>
            <DataTestRunTable
              runs={runs}
              hasFilters={hasFilters}
              onSelect={setSelectedRunId}
            />
            {data.total > PAGE_SIZE && (
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
          </>
        )}
      </Stack>
      {selectedRun != null && (
        <DataTestRunSidebar
          testName={test.name}
          subjectLink={<SubjectLink test={test} />}
          run={selectedRun}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedRunId(undefined)}
        />
      )}
    </Flex>
  );
}
