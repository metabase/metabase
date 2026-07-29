import { t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Box, Card } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import { CheckpointValue } from "../../../../components/CheckpointValue";
import { SidebarInfoRow } from "../../../../components/SidebarInfoRow";
import {
  formatRunMethod,
  formatStatus,
  isErrorStatus,
} from "../../../../utils";

type InfoSectionProps = {
  run: TransformRun;
};

export function InfoSection({ run }: InfoSectionProps) {
  const { data: checkpointField } = useGetFieldQuery(
    run.checkpoint_filter_field_id
      ? { id: run.checkpoint_filter_field_id }
      : skipToken,
  );

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
        <Box c={isErrorStatus(run.status) ? "feedback-negative" : undefined}>
          {formatStatus(run.status)}
        </Box>
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Trigger`}>
        {formatRunMethod(run.run_method)}
      </SidebarInfoRow>
      {checkpointField != null && (
        <SidebarInfoRow label={t`Checkpoint field`}>
          {checkpointField.display_name}
        </SidebarInfoRow>
      )}
      {run.checkpoint_lo_value != null && (
        <SidebarInfoRow label={t`Checkpoint from`}>
          <CheckpointValue
            value={run.checkpoint_lo_value}
            checkpointField={checkpointField}
          />
        </SidebarInfoRow>
      )}
      {run.checkpoint_hi_value != null && (
        <SidebarInfoRow label={t`Checkpoint to`}>
          <CheckpointValue
            value={run.checkpoint_hi_value}
            checkpointField={checkpointField}
          />
        </SidebarInfoRow>
      )}
    </Card>
  );
}
