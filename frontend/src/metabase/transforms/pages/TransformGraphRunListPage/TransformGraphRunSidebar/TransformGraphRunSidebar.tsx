import { memo, useState } from "react";
import { t } from "ttag";

import {
  useCancelCurrentTransformRunMutation,
  useCancelDagRunMutation,
  useListTransformGraphRunMembersQuery,
} from "metabase/api";
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

import { TransformGraphRunInfoSection } from "./TransformGraphRunInfoSection";
import S from "./TransformGraphRunSidebar.module.css";

const EMPTY_TRANSFORM_RUNS: TransformRunForJobRun[] = [];

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
            <TransformGraphRunInfoSection run={run} />
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

type TransformGraphRunSidebarHeaderProps = {
  run: TransformGraphRun;
  onClose: () => void;
};

function TransformGraphRunSidebarHeader({
  run,
  onClose,
}: TransformGraphRunSidebarHeaderProps) {
  const [cancelDagRun] = useCancelDagRunMutation();
  const [cancelTransformRun] = useCancelCurrentTransformRunMutation();
  const { sendErrorToast } = useMetadataToasts();

  // Job runs have no single-run cancel endpoint yet, so cancellation is offered
  // only for DAG runs and standalone transform runs that are still in progress.
  // For a DAG run `id` is the dag-run id; for a standalone run `entity_id` is the
  // transform id.
  const canCancel =
    run.status === "started" &&
    (run.run_type === "dag" ||
      (run.run_type === "transform" && run.entity_id != null));

  const handleCancel = async () => {
    let error: unknown;
    if (run.run_type === "dag") {
      ({ error } = await cancelDagRun(run.id));
    } else if (run.run_type === "transform" && run.entity_id != null) {
      ({ error } = await cancelTransformRun(run.entity_id));
    }
    if (error && !isResourceNotFoundError(error)) {
      sendErrorToast(t`Failed to cancel run`);
    }
  };

  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      data-testid="transform-graph-run-sidebar-header"
    >
      <Title order={3}>{t`Run`}</Title>
      <Group gap="sm" wrap="nowrap">
        {canCancel && (
          <Button size="xs" onClick={handleCancel}>{t`Cancel run`}</Button>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
