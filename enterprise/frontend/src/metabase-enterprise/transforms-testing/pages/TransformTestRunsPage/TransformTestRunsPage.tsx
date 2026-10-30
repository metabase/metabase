import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLocation, useNavigate } from "metabase/router";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { Center, Flex, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useListTransformTestRunsQuery,
  useRunTransformTestMutation,
} from "metabase-enterprise/api";
import type {
  Transform,
  TransformTest,
  TransformTestRunId,
  TransformTestRunWithUser,
} from "metabase-types/api";

import { TransformTestHeader } from "../../components/TransformTestHeader";
import { TransformTestRunButton } from "../../components/TransformTestRunButton";
import { PAGE_SIZE } from "../../constants";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";
import { getRunTransformTestCacheKey } from "../../utils";

import { TransformTestRunFilterBar } from "./TransformTestRunFilterBar";
import { TransformTestRunSidebar } from "./TransformTestRunSidebar";
import { TransformTestRunTable } from "./TransformTestRunTable";
import S from "./TransformTestRunsPage.module.css";
import { getParsedParams } from "./utils";

const EMPTY_RUNS: TransformTestRunWithUser[] = [];

export function TransformTestRunsPage() {
  const { transform, test, readOnly, isLoading, error } =
    useRouteTransformTest();

  if (transform == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <TransformTestRuns transform={transform} test={test} readOnly={readOnly} />
  );
}

type TransformTestRunsProps = {
  transform: Transform;
  test: TransformTest;
  readOnly: boolean;
};

function TransformTestRuns({
  transform,
  test,
  readOnly,
}: TransformTestRunsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = getParsedParams(location);
  const { page = 0 } = params;
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedRunId, setSelectedRunId] = useState<TransformTestRunId>();
  const [isPolling, setIsPolling] = useState(false);
  const [, { isLoading: isRunning }] = useRunTransformTestMutation({
    fixedCacheKey: getRunTransformTestCacheKey(test.id),
  });

  const { data, isLoading, error } = useListTransformTestRunsQuery(
    {
      id: test.id,
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
    filterOptions: Omit<Urls.TransformTestRunListParams, "page">,
  ) => {
    navigate(
      Urls.transformTestRuns(test.transform_id, test.id, filterOptions),
      { replace: true },
    );
  };

  const handlePageChange = (page: number) => {
    navigate(
      Urls.transformTestRuns(test.transform_id, test.id, { ...params, page }),
      { replace: true },
    );
  };

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <PageContainer
        className={S.main}
        flex={1}
        data-testid="transform-test-runs"
      >
        <TransformTestHeader transform={transform} test={test} />
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="nowrap">
            <TransformTestRunFilterBar
              filterOptions={{
                statuses: params.statuses,
                startTime: params.startTime,
                endTime: params.endTime,
              }}
              onFilterOptionsChange={handleFilterOptionsChange}
            />
            <TransformTestRunButton
              test={test}
              readOnly={readOnly}
              triggeredFrom="test_runs"
            />
          </Group>
          {data == null || isLoading || error != null ? (
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          ) : (
            <>
              <TransformTestRunTable
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
        <TransformTestRunSidebar
          transform={transform}
          test={test}
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
