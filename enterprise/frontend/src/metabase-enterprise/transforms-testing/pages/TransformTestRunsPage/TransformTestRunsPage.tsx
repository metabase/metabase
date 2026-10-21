import { useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useLocation, useNavigate } from "metabase/router";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { Center, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useListTransformTestRunsQuery,
  useRunTransformTestMutation,
} from "metabase-enterprise/api";
import type {
  TransformTest,
  TransformTestRunWithUser,
} from "metabase-types/api";

import { TransformTestHeader } from "../../components/TransformTestHeader";
import { TransformTestRunButton } from "../../components/TransformTestRunButton";
import { PAGE_SIZE } from "../../constants";
import { useRouteTransformTest } from "../../hooks/use-route-transform-test";
import { getRunTransformTestCacheKey } from "../../utils";

import { TransformTestRunTable } from "./TransformTestRunTable";
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
    <PageContainer data-testid="transform-test-runs">
      <TransformTestHeader transform={transform} test={test} />
      <TransformTestRuns test={test} readOnly={readOnly} />
    </PageContainer>
  );
}

type TransformTestRunsProps = {
  test: TransformTest;
  readOnly: boolean;
};

function TransformTestRuns({ test, readOnly }: TransformTestRunsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = getParsedParams(location);
  const { page = 0 } = params;
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

  const shouldPoll = isRunning || runs.some((run) => run.status === "started");
  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  const handlePageChange = (page: number) => {
    navigate(
      Urls.transformTestRuns(test.transform_id, test.id, { ...params, page }),
      { replace: true },
    );
  };

  return (
    <Stack gap="lg">
      <Group justify="flex-end">
        <TransformTestRunButton test={test} readOnly={readOnly} />
      </Group>
      {data == null || isLoading || error != null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <>
          <TransformTestRunTable runs={runs} />
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
  );
}
