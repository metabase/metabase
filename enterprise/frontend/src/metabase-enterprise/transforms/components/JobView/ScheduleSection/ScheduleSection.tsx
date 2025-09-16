import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import { useSetting } from "metabase/common/hooks";
import {
  formatCronExpressionForUI,
  getScheduleExplanation,
} from "metabase/lib/cron";
import { timezoneToUTCOffset } from "metabase/lib/time-dayjs";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Icon, Tooltip } from "metabase/ui";
import { useRunTransformJobMutation } from "metabase-enterprise/api";
import { trackTransformJobTriggerManualRun } from "metabase-enterprise/transforms/analytics";

import { RunButton } from "../../../components/RunButton";
import { SplitSection } from "../../../components/SplitSection";
import type { TransformJobInfo } from "../types";

type ScheduleSectionProps = {
  job: TransformJobInfo;
  onScheduleChange: (schedule: string) => void;
};

export function ScheduleSection({
  job,
  onScheduleChange,
}: ScheduleSectionProps) {
  const [schedule, setSchedule] = useState(() =>
    formatCronExpressionForUI(job.schedule),
  );
  const scheduleExplanation = getScheduleExplanation(schedule);
  const systemTimezone = useSetting("system-timezone") ?? "UTC";
  const timezoneOffset = timezoneToUTCOffset(systemTimezone);
  const timezoneExplanation =
    timezoneOffset === "+00:00" ? "UTC" : `UTC${timezoneOffset}`;

  return (
    <SplitSection
      label={t`Schedule`}
      description={t`Use cron syntax to set this job’s schedule.`}
    >
      <Box px="xl" py="lg">
        <CronSection
          schedule={schedule}
          onChangeSchedule={setSchedule}
          onChangeSubmit={onScheduleChange}
        />
      </Box>
      <Divider />
      <Group
        px="xl"
        py="md"
        justify={scheduleExplanation ? "space-between" : "end"}
      >
        {scheduleExplanation != null && (
          <Group gap="sm" c="text-secondary">
            <Icon name="calendar" />
            {t`This job will run ${scheduleExplanation}, ${timezoneExplanation}`}
          </Group>
        )}
        <RunButtonSection job={job} />
      </Group>
    </SplitSection>
  );
}

type CronSectionProps = {
  schedule: string;
  onChangeSchedule: (schedule: string) => void;
  onChangeSubmit: (schedule: string) => void;
};

function CronSection({
  schedule,
  onChangeSchedule,
  onChangeSubmit,
}: CronSectionProps) {
  return (
    <CronExpressionInput
      value={schedule}
      onChange={onChangeSchedule}
      onBlurChange={onChangeSubmit}
    />
  );
}

type RunButtonSectionProps = {
  job: TransformJobInfo;
};

function RunButtonSection({ job }: RunButtonSectionProps) {
  const [runJob] = useRunTransformJobMutation();
  const { sendErrorToast } = useMetadataToasts();
  const isSaved = job.id != null;
  const hasTags = job.tag_ids?.length !== 0;

  const handleRun = async () => {
    if (job.id == null) {
      return;
    }

    trackTransformJobTriggerManualRun({
      jobId: job.id,
      triggeredFrom: "job-page",
    });

    const { error } = await runJob(job.id);

    if (error) {
      sendErrorToast(t`Failed to run job`);
    }
  };

  return (
    <Tooltip label={t`This job doesn't have tags to run.`} disabled={hasTags}>
      <RunButton
        run={job.last_run}
        isDisabled={!isSaved || !hasTags}
        onRun={handleRun}
      />
    </Tooltip>
  );
}
