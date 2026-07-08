import { useDisclosure } from "@mantine/hooks";
import { memo, useState } from "react";
import { t } from "ttag";

import {
  useCancelCurrentTransformRunMutation,
  useCancelDagRunMutation,
  useCancelJobRunMutation,
  useListTransformGraphRunMembersQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
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
import { isResourceNotFoundError } from "metabase/utils/errors";
import type {
  TransformGraphRun,
  TransformRunForJobRun,
} from "metabase-types/api";

import { TransformRunItem } from "../../JobRunListPage/JobRunSidebar/TransformRunItem";
import { getRunName } from "../TransformGraphRunTable";

import { TransformGraphRunInfoSection } from "./TransformGraphRunInfoSection";
import S from "./TransformGraphRunSidebar.module.css";

const EMPTY_TRANSFORM_RUNS: TransformRunForJobRun[] = [];

// Cancellation is offered for any in-progress run. The cancel call differs by type:
// DAG uses the dag-run `id`; a standalone run uses its transform `entity_id`; a job
// run uses its job `entity_id` (jobId) plus the run `id` (runId).
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

  const {
    data: transformRuns = EMPTY_TRANSFORM_RUNS,
    isLoading,
    error,
  } = useListTransformGraphRunMembersQuery(
    { run_type: run.run_type, id: run.id },
    { pollingInterval: isPolling ? POLLING_INTERVAL : undefined },
  );

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
      align="start"
      wrap="nowrap"
      gap="sm"
      data-testid="transform-graph-run-sidebar-header"
    >
      <Title order={3}>{getRunName(run)}</Title>
      <ActionIcon aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
