import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { SidebarResizableBox } from "metabase/common/components/SidebarResizableBox";
import { SidebarInfoRow } from "metabase/transforms/components/SidebarInfoRow";
import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Transform,
  TransformTest,
  TransformTestRunWithUser,
} from "metabase-types/api";

import { formatTestRunStatus, isFailedTestRunStatus } from "../../../utils";

import S from "./TransformTestRunSidebar.module.css";

type TransformTestRunSidebarProps = {
  transform: Transform;
  test: TransformTest;
  run: TransformTestRunWithUser;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function TransformTestRunSidebar({
  transform,
  test,
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: TransformTestRunSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="xl"
        gap="xl"
        bg="background_page-primary"
        data-testid="transform-test-run-sidebar"
      >
        <Group gap="md" wrap="nowrap" align="start" justify="space-between">
          <Title order={3}>{test.name}</Title>
          <ActionIcon variant="subtle" aria-label={t`Close`} onClick={onClose}>
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="transform" c="core-brand" />
          <Anchor component={ForwardRefLink} to={Urls.transform(transform.id)}>
            {transform.name}
          </Anchor>
        </Group>
        <TransformTestRunInfo run={run} />
      </Stack>
    </SidebarResizableBox>
  );
}

function TransformTestRunInfo({ run }: { run: TransformTestRunWithUser }) {
  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <SidebarInfoRow label={t`Started at`}>
        <DateTime value={run.start_time} unit="minute" />
      </SidebarInfoRow>
      {run.end_time != null && (
        <SidebarInfoRow label={t`Ended at`}>
          <DateTime value={run.end_time} unit="minute" />
        </SidebarInfoRow>
      )}
      <SidebarInfoRow label={t`Status`}>
        <Box
          c={
            isFailedTestRunStatus(run.status) ? "feedback-negative" : undefined
          }
        >
          {formatTestRunStatus(run.status)}
        </Box>
      </SidebarInfoRow>
      {run.initiated_by_user != null && (
        <SidebarInfoRow label={t`Run by`}>
          {run.initiated_by_user.common_name}
        </SidebarInfoRow>
      )}
    </Card>
  );
}
