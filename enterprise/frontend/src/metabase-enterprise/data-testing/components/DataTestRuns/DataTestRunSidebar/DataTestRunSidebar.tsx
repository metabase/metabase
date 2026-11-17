import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { SidebarResizableBox } from "metabase/common/components/SidebarResizableBox";
import { SidebarInfoRow } from "metabase/transforms/components/SidebarInfoRow";
import {
  ActionIcon,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import type { DataTestRunWithUser } from "metabase-types/api";

import {
  formatDataTestRunStatus,
  isFailedDataTestRunStatus,
} from "../../../utils";

import S from "./DataTestRunSidebar.module.css";

type DataTestRunSidebarProps = {
  testName: string;
  subjectLink: ReactNode;
  run: DataTestRunWithUser;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function DataTestRunSidebar({
  testName,
  subjectLink,
  run,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: DataTestRunSidebarProps) {
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
        data-testid="data-test-run-sidebar"
      >
        <Group gap="md" wrap="nowrap" align="start" justify="space-between">
          <Title order={3}>{testName}</Title>
          <ActionIcon variant="subtle" aria-label={t`Close`} onClick={onClose}>
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>
        {subjectLink}
        <DataTestRunInfo run={run} />
      </Stack>
    </SidebarResizableBox>
  );
}

function DataTestRunInfo({ run }: { run: DataTestRunWithUser }) {
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
            isFailedDataTestRunStatus(run.status)
              ? "feedback-negative"
              : undefined
          }
        >
          {formatDataTestRunStatus(run.status)}
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
