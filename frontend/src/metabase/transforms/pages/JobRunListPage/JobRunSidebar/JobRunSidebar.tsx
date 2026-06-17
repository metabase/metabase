import { memo } from "react";
import { t } from "ttag";

import { useListJobRunTransformRunsQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarResizableBox } from "metabase/transforms/components/SidebarResizableBox";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import type { TransformJobId, TransformJobRun } from "metabase-types/api";

import { JobRunInfoSection } from "./JobRunInfoSection";
import S from "./JobRunSidebar.module.css";
import { TransformRunItem } from "./TransformRunItem";

type JobRunSidebarProps = {
  jobId: TransformJobId;
  run: TransformJobRun;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const JobRunSidebar = memo(function JobRunSidebar({
  jobId,
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: JobRunSidebarProps) {
  const {
    data: transformRuns = [],
    isLoading,
    error,
  } = useListJobRunTransformRunsQuery({ jobId, runId: run.id });

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
          <JobRunSidebarHeader onClose={onClose} />
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
              {isLoading || error != null ? (
                <LoadingAndErrorWrapper loading={isLoading} error={error} />
              ) : transformRuns.length === 0 ? (
                <ListEmptyState label={t`No transform runs`} />
              ) : (
                <Card p={0} shadow="none" withBorder>
                  {transformRuns.map((transformRun) => (
                    <TransformRunItem
                      key={transformRun.id}
                      transformRun={transformRun}
                    />
                  ))}
                </Card>
              )}
            </Stack>
          </Stack>
        </Box>
      </Flex>
    </SidebarResizableBox>
  );
});

type JobRunSidebarHeaderProps = {
  onClose: () => void;
};

function JobRunSidebarHeader({ onClose }: JobRunSidebarHeaderProps) {
  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      data-testid="job-run-list-sidebar-header"
    >
      <Title order={3}>{t`Job run`}</Title>
      <ActionIcon aria-label={t`Close`} onClick={onClose}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
