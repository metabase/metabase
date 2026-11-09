import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
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

import { DataTestRunFilterBar } from "./DataTestRunFilterBar";
import { DataTestRunSidebar } from "./DataTestRunSidebar";
import { DataTestRunTable } from "./DataTestRunTable";
import S from "./DataTestRuns.module.css";
import { getParsedParams } from "./utils";

const EMPTY_RUNS: DataTestRunWithUser[] = [];

type DataTestRunsProps = {
  testType: DataTestType;
  testId: DataTestId;
  testName: string;
  header: ReactNode;
  subjectLink: ReactNode;
  runButton: ReactNode;
  isRunning: boolean;
  getRunsUrl: (params: Urls.DataTestRunListParams) => string;
};

/**
 * The run history of one test: filters, a paginated table of runs, and a
 * sidebar with the selected run. The caller supplies what depends on the test
 * type: the page header, the link to the tested entity, the run button, and
 * the URL of each filtered page.
 */
export function DataTestRuns({
  testType,
  testId,
  testName,
  header,
  subjectLink,
  runButton,
  isRunning,
  getRunsUrl,
}: DataTestRunsProps) {
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

  const handleFilterOptionsChange = (
    filterOptions: Omit<Urls.DataTestRunListParams, "page">,
  ) => {
    navigate(getRunsUrl(filterOptions), { replace: true });
  };

  const handlePageChange = (page: number) => {
    navigate(getRunsUrl({ ...params, page }), { replace: true });
  };

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <PageContainer className={S.main} flex={1} data-testid="data-test-runs">
        {header}
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="nowrap">
            <DataTestRunFilterBar
              filterOptions={{
                statuses: params.statuses,
                startTime: params.startTime,
                endTime: params.endTime,
              }}
              onFilterOptionsChange={handleFilterOptionsChange}
            />
            {runButton}
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
      </PageContainer>
      {selectedRun != null && (
        <DataTestRunSidebar
          testName={testName}
          subjectLink={subjectLink}
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
