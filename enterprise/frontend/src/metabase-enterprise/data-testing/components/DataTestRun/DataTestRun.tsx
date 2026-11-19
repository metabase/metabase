import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import {
  Anchor,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useGetDataTestRunQuery } from "metabase-enterprise/api";
import type {
  DataTestId,
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
  const { getTestRunsUrl } = definition.useTestUrls();
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
    <Stack gap="lg" data-testid="data-test-run">
      <Anchor component={Link} to={getTestRunsUrl(test)} lh="inherit">
        <Group component="span" gap="xs" wrap="nowrap">
          <FixedSizeIcon name="chevronleft" />
          {t`All runs`}
        </Group>
      </Anchor>
      <Flex gap="xl" align="start" wrap="wrap-reverse">
        <Box flex="1 1 30rem" miw={0}>
          {run.result != null ? (
            <DataTestRunResult result={run.result} />
          ) : (
            <Stack component="section" aria-label={t`Result`} gap="lg">
              <Title order={4}>{t`Result`}</Title>
              <Text c="text-secondary">
                {run.status === "started"
                  ? t`This run is still in progress.`
                  : t`This run has no stored result.`}
              </Text>
            </Stack>
          )}
        </Box>
        <Stack flex="0 1 20rem" gap="lg">
          <SubjectLink test={test} />
          <DataTestRunInfo run={run} />
        </Stack>
      </Flex>
    </Stack>
  );
}
