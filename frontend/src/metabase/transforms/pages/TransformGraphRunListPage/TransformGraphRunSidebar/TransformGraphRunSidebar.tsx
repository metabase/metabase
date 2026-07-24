import { useDisclosure } from "@mantine/hooks";
import { memo, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  skipToken,
  useCancelCurrentTransformRunMutation,
  useCancelDagRunMutation,
  useCancelJobRunMutation,
  useListDagRunTransformRunsQuery,
  useListJobRunTransformRunsQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { SidebarResizableBox } from "metabase/transforms/components/SidebarResizableBox";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import { isActiveRunStatus } from "metabase/transforms/utils";
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
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isResourceNotFoundError } from "metabase/utils/errors";
import type {
  TransformGraphRun,
  TransformRunForJobRun,
} from "metabase-types/api";

import { TransformRunItem } from "../../JobRunListPage/JobRunSidebar/TransformRunItem";
import { RunName, isDeletedRun } from "../TransformGraphRunTable";

import { TransformGraphRunInfoSection } from "./TransformGraphRunInfoSection";
import S from "./TransformGraphRunSidebar.module.css";

const EMPTY_TRANSFORM_RUNS: TransformRunForJobRun[] = [];

function canCancelRun(run: TransformGraphRun): boolean {
  if (run.status !== "started") {
    return false;
  }
  return run.run_type === "dag" || run.entity_id != null;
}

type TransformGraphRunSidebarProps = {
  run: TransformGraphRun;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const TransformGraphRunSidebar = memo(function TransformGraphRunSidebar({
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: TransformGraphRunSidebarProps) {
  const [isPolling, setIsPolling] = useState(false);
  const pollingInterval = isPolling ? POLLING_INTERVAL : undefined;

  const areMembersUnavailable = run.run_type === "job" && isDeletedRun(run);

  const dagResult = useListDagRunTransformRunsQuery(
    run.run_type === "dag" ? { dagRunId: run.id } : skipToken,
    { pollingInterval },
  );
  const jobResult = useListJobRunTransformRunsQuery(
    run.run_type === "job" && run.entity_id != null
      ? { jobId: run.entity_id, runId: run.id }
      : skipToken,
    { pollingInterval },
  );
  const standaloneRuns = useMemo<TransformRunForJobRun[]>(
    () =>
      run.run_type === "transform"
        ? [
            {
              id: run.id,
              transform_id: run.entity_id,
              transform_name: run.name,
              job_run_id: null,
              status: run.status,
              run_method: run.run_method ?? "manual",
              start_time: run.start_time,
              end_time: run.end_time,
              message: run.message,
            },
          ]
        : EMPTY_TRANSFORM_RUNS,
    [run],
  );

  const { transformRuns, isLoading, error } = match(run.run_type)
    .with("dag", () => ({
      transformRuns: dagResult.data ?? EMPTY_TRANSFORM_RUNS,
      isLoading: dagResult.isLoading,
      error: dagResult.error,
    }))
    .with("job", () => ({
      transformRuns: jobResult.data ?? EMPTY_TRANSFORM_RUNS,
      isLoading: jobResult.isLoading,
      error: jobResult.error,
    }))
    .with("transform", () => ({
      transformRuns: standaloneRuns,
      isLoading: false,
      error: undefined,
    }))
    .exhaustive();

  const shouldPoll =
    isActiveRunStatus(run.status) ||
    transformRuns.some((transformRun) =>
      isActiveRunStatus(transformRun.status),
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
        data-testid="transform-graph-run-sidebar"
      >
        <Box className={S.header} p="lg">
          <TransformGraphRunSidebarHeader run={run} onClose={onClose} />
        </Box>
        <Box className={S.scrollArea} flex={1} mih={0} p="lg">
          <Stack gap="xl">
            <Stack gap="md">
              <TransformGraphRunInfoSection run={run} />
              {canCancelRun(run) && <CancelationSection run={run} />}
            </Stack>
            {!areMembersUnavailable && (
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
            )}
          </Stack>
        </Box>
      </Flex>
    </SidebarResizableBox>
  );
});

type CancelationSectionProps = {
  run: TransformGraphRun;
};

function CancelationSection({ run }: CancelationSectionProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const [cancelDagRun, { isLoading: isCancelingDag }] =
    useCancelDagRunMutation();
  const [cancelJobRun, { isLoading: isCancelingJob }] =
    useCancelJobRunMutation();
  const [cancelTransformRun, { isLoading: isCancelingTransform }] =
    useCancelCurrentTransformRunMutation();
  const isCanceling = isCancelingDag || isCancelingJob || isCancelingTransform;

  const handleCancel = async () => {
    let error: unknown;
    if (run.run_type === "dag") {
      ({ error } = await cancelDagRun(run.id));
    } else if (run.run_type === "job" && run.entity_id != null) {
      ({ error } = await cancelJobRun({ jobId: run.entity_id, runId: run.id }));
    } else if (run.run_type === "transform" && run.entity_id != null) {
      ({ error } = await cancelTransformRun(run.entity_id));
    }
    closeModal();
    if (error && !isResourceNotFoundError(error)) {
      sendErrorToast(t`Failed to cancel run`);
    }
  };

  return (
    <>
      <Group justify="flex-end">
        <Button
          variant="filled"
          color="feedback-negative"
          disabled={isCanceling}
          onClick={openModal}
        >
          {t`Cancel run`}
        </Button>
      </Group>
      <ConfirmModal
        title={t`Cancel this run?`}
        message={t`This stops the run and requests cancellation of any transforms still in progress. Transforms that have already finished won't be reverted.`}
        confirmButtonText={t`Cancel run`}
        closeButtonText={t`Keep running`}
        opened={isModalOpen}
        onClose={closeModal}
        onConfirm={handleCancel}
      />
    </>
  );
}

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

type TransformGraphRunSidebarHeaderProps = {
  run: TransformGraphRun;
  onClose: () => void;
};

function TransformGraphRunSidebarHeader({
  run,
  onClose,
}: TransformGraphRunSidebarHeaderProps) {
  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      gap="sm"
      data-testid="transform-graph-run-sidebar-header"
    >
      <Title order={3}>
        <RunName run={run} gap="sm" />
      </Title>
      <Group gap="xs" wrap="nowrap">
        <HeaderEntityActions run={run} />
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}

function HeaderEntityActions({ run }: { run: TransformGraphRun }) {
  const { entity_id } = run;
  if (entity_id == null) {
    return null;
  }

  if (run.run_type === "job") {
    return (
      <Tooltip label={t`View this job`}>
        <ActionIcon
          component={ForwardRefLink}
          to={Urls.transformJob(entity_id)}
          target="_blank"
          aria-label={t`View this job`}
        >
          <FixedSizeIcon name="external" />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip label={t`View this transform`}>
        <ActionIcon
          component={ForwardRefLink}
          to={Urls.transform(entity_id)}
          target="_blank"
          aria-label={t`View this transform`}
        >
          <FixedSizeIcon name="external" />
        </ActionIcon>
      </Tooltip>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Tooltip label={t`View in dependency graph`}>
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({
              entry: { id: entity_id, type: "transform" },
            })}
            target="_blank"
            aria-label={t`View in dependency graph`}
          >
            <FixedSizeIcon name="dependencies" />
          </ActionIcon>
        </Tooltip>
      )}
    </>
  );
}
