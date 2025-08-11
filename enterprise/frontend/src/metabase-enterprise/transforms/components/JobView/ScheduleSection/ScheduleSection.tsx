import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import {
  formatCronExpressionForUI,
  getScheduleExplanation,
} from "metabase/lib/cron";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Icon, Tooltip } from "metabase/ui";
import {
  useExecuteTransformJobMutation,
  useLazyGetTransformJobQuery,
} from "metabase-enterprise/api";

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
            {t`This job will run ${scheduleExplanation}`}
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
  const [fetchJob, { isFetching }] = useLazyGetTransformJobQuery();
  const [executeJob, { isLoading: isExecuting }] =
    useExecuteTransformJobMutation();
  const { sendErrorToast } = useMetadataToasts();
  const isSaved = job.id != null;
  const hasTags = job.tag_ids?.length !== 0;

  const handleRun = async () => {
    if (job.id == null) {
      return;
    }
    const { error } = await executeJob(job.id);
    if (error) {
      sendErrorToast(t`Failed to run job`);
    } else {
      fetchJob(job.id);
    }
  };

  return (
    <Tooltip label={t`This job doesn't have tags to run.`} disabled={hasTags}>
      <RunButton
        execution={job.last_execution}
        isLoading={isFetching || isExecuting}
        isDisabled={!isSaved || !hasTags}
        onRun={handleRun}
      />
    </Tooltip>
  );
}
