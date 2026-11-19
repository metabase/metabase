import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";
import { useGetDataTestRunQuery } from "metabase-enterprise/api";
import type {
  DataTestId,
  DataTestRunDetail,
  DataTestRunId,
  DataTestType,
} from "metabase-types/api";

import { getDataTestTypeDefinition } from "../../test-types";
import { DataTestRunInfo } from "../DataTestRunInfo";
import { DataTestRunResult } from "../DataTestRunResult";

type DataTestRunProps<K extends DataTestType> = {
  testType: K;
  testId: DataTestId;
  runId: DataTestRunId;
};

export function DataTestRun<K extends DataTestType>({
  testType,
  testId,
  runId,
}: DataTestRunProps<K>) {
  const definition = getDataTestTypeDefinition(testType);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = definition.useGetTestQuery(testId);
  const { getTestUrl } = definition.useTestUrls();
  const [isPolling, setIsPolling] = useState(false);
  const {
    data: run,
    isLoading: isLoadingRun,
    error: runError,
  } = useGetDataTestRunQuery(runId, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  const shouldPoll = run?.status === "started";
  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  if (test == null || run == null || isLoadingTest || isLoadingRun) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingTest || isLoadingRun}
        error={testError ?? runError}
      />
    );
  }

  if (run.test_type !== testType || run.test_id !== test.id) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  const { SubjectLink } = definition;

  return (
    <Flex
      gap="xl"
      align="start"
      wrap="wrap-reverse"
      data-testid="data-test-run"
    >
      <Box flex="1 1 30rem" miw={0}>
        {run.result != null ? (
          <DataTestRunResult result={run.result} testUrl={getTestUrl(test)} />
        ) : (
          <Stack component="section" aria-label={t`Result`} gap="lg">
            <Title order={4}>{t`Result`}</Title>
            <Text c="text-secondary">{getMissingResultMessage(run)}</Text>
          </Stack>
        )}
      </Box>
      <Stack flex="0 1 20rem" gap="lg">
        <SubjectLink test={test} />
        <DataTestRunInfo run={run} />
      </Stack>
    </Flex>
  );
}

function getMissingResultMessage(run: DataTestRunDetail) {
  if (run.status === "started") {
    return t`This run is still in progress.`;
  }
  if (!run.can_read_result) {
    return t`Only people who can run this test can see its result.`;
  }
  return t`This run has no stored result.`;
}
