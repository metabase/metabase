import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { SidebarInfoRow } from "metabase/transforms/components/SidebarInfoRow";
import { Box, Card } from "metabase/ui";
import type { DataTestRunWithUser } from "metabase-types/api";

import {
  formatDataTestRunStatus,
  isFailedDataTestRunStatus,
} from "../../utils";

type DataTestRunInfoProps = {
  run: DataTestRunWithUser;
};

export function DataTestRunInfo({ run }: DataTestRunInfoProps) {
  return (
    <Card
      p={0}
      flex="none"
      shadow="none"
      withBorder
      role="region"
      aria-label={t`Info`}
    >
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
