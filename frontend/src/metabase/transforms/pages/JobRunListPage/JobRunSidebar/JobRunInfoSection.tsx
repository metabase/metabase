import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { SidebarInfoRow } from "metabase/transforms/components/SidebarInfoRow";
import {
  formatRunMethod,
  formatStatus,
  getRunDurationMs,
  isErrorStatus,
} from "metabase/transforms/utils";
import { Box, Card } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatDurationLong } from "metabase/utils/formatting/time";
import type { TransformJobRun } from "metabase-types/api";

type JobRunInfoSectionProps = {
  run: TransformJobRun;
};

export function JobRunInfoSection({ run }: JobRunInfoSectionProps) {
  const durationMs = getRunDurationMs(run);

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <SidebarInfoRow label={t`Status`}>
        <Box c={isErrorStatus(run.status) ? "feedback-negative" : undefined}>
          {formatStatus(run.status)}
        </Box>
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Trigger`}>
        {formatRunMethod(run.run_method)}
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Started at`}>
        <DateTime value={run.start_time} unit="minute" />
      </SidebarInfoRow>
      {run.end_time != null && (
        <SidebarInfoRow label={t`Ended at`}>
          <DateTime value={run.end_time} unit="minute" />
        </SidebarInfoRow>
      )}
      <SidebarInfoRow label={t`Duration`}>
        {durationMs != null
          ? formatDurationLong(durationMs)
          : EMPTY_CELL_PLACEHOLDER}
      </SidebarInfoRow>
    </Card>
  );
}
