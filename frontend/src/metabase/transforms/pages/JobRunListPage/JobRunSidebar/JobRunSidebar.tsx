import { memo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListDagRunTransformRunsQuery,
  useListJobRunTransformRunsQuery,
} from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarResizableBox } from "metabase/transforms/components/SidebarResizableBox";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import type {
  TransformBatchRun,
  TransformId,
  TransformJobId,
  TransformRunForJobRun,
} from "metabase-types/api";

import { JobRunInfoSection } from "./JobRunInfoSection";
import S from "./JobRunSidebar.module.css";
import { TransformRunItem } from "./TransformRunItem";

type JobRunSidebarProps = {
  // Provide `jobId` for scheduled job runs, or `sourceTransformId` for manual DAG runs —
  // each selects the matching transform-run drilldown query.
  jobId?: TransformJobId;
  sourceTransformId?: TransformId | null;
  run: TransformBatchRun;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
  // When provided, a Cancel button is shown while the run is in progress.
  onCancel?: () => void;
};

export const JobRunSidebar = memo(function JobRunSidebar({
  jobId,
  sourceTransformId,
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
  onCancel,
}: JobRunSidebarProps) {
  const [isPolling, setIsPolling] = useState(false);
  const pollingOption = {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  };
  const isDagRun = jobId == null;

  const jobResult = useListJobRunTransformRunsQuery(
    jobId != null ? { jobId, runId: run.id } : skipToken,
    pollingOption,
  );
  const dagResult = useListDagRunTransformRunsQuery(
    isDagRun && sourceTransformId != null
      ? { transformId: sourceTransformId, dagRunId: run.id }
      : skipToken,
    pollingOption,
  );

  const {
    data: transformRuns = [],
    isLoading,
    error,
  } = isDagRun ? dagResult : jobResult;

  const shouldPoll =
    run.status === "started" ||
    transformRuns.some(
      (transformRun) =>
        transformRun.status === "started" ||
        transformRun.status === "canceling",
    );
  if (isPolling !== shouldPoll) {
    setIsPolling(shouldPoll);
  }

  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Flex
        className={S.sidebar}
        direction="column"
        flex={1}
        h="100%"
        bg="background_page-primary"
        data-testid="job-run-list-sidebar"
      >
        <Box className={S.header} p="lg">
          <JobRunSidebarHeader
            title={isDagRun ? t`DAG run` : t`Job run`}
            onCancel={
              onCancel != null && run.status === "started"
                ? onCancel
                : undefined
            }
            onClose={onClose}
          />
        </Box>
        <Box className={S.scrollArea} flex={1} mih={0} p="lg">
          <Stack gap="xl">
            <JobRunInfoSection run={run} />
            <Stack gap="md">
              <Group gap="sm" wrap="nowrap">
                <Badge variant="filled" bg="core-brand">
                  {transformRuns.length}
                </Badge>
                <Title order={5}>{t`Transforms`}</Title>
              </Group>
              <TransformRunList
                transformRuns={transformRuns}
                isLoading={isLoading}
                error={error}
              />
            </Stack>
          </Stack>
        </Box>
      </Flex>
    </SidebarResizableBox>
  );
});

type TransformRunListProps = {
  transformRuns: TransformRunForJobRun[];
  isLoading: boolean;
  error: unknown;
};

function TransformRunList({
  transformRuns,
  isLoading,
  error,
}: TransformRunListProps) {
  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transformRuns.length === 0) {
    return <ListEmptyState label={t`No transform runs`} />;
  }

  return (
    <Card p={0} shadow="none" withBorder>
      {transformRuns.map((transformRun) => (
        <TransformRunItem key={transformRun.id} transformRun={transformRun} />
      ))}
    </Card>
  );
}

type JobRunSidebarHeaderProps = {
  title: string;
  onCancel?: () => void;
  onClose: () => void;
};

function JobRunSidebarHeader({
  title,
  onCancel,
  onClose,
}: JobRunSidebarHeaderProps) {
  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      data-testid="job-run-list-sidebar-header"
    >
      <Title order={3}>{title}</Title>
      <Group gap="sm" wrap="nowrap">
        {onCancel != null && (
          <Button size="xs" color="error" variant="subtle" onClick={onCancel}>
            {t`Cancel run`}
          </Button>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
