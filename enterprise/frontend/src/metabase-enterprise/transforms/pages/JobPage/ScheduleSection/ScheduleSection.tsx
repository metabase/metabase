import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import {
  formatCronExpressionForUI,
  getScheduleExplanation,
} from "metabase/lib/cron";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Icon } from "metabase/ui";
import {
  useExecuteTransformJobMutation,
  useUpdateTransformJobMutation,
} from "metabase-enterprise/api";
import type { TransformJob } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { SplitSection } from "../../../components/SplitSection";

type ScheduleSectionProps = {
  job: TransformJob;
};

export function ScheduleSection({ job }: ScheduleSectionProps) {
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
          job={job}
          schedule={schedule}
          onChangeSchedule={setSchedule}
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
  job: TransformJob;
  schedule: string;
  onChangeSchedule: (schedule: string) => void;
};

function CronSection({ job, schedule, onChangeSchedule }: CronSectionProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleBlurChange = async (newSchedule: string) => {
    const { error } = await updateJob({
      id: job.id,
      schedule: newSchedule,
    });

    if (error) {
      sendErrorToast(t`Failed to update job schedule`);
    } else {
      sendSuccessToast(t`Job schedule updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          schedule: job.schedule,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <CronExpressionInput
      value={schedule}
      onChange={onChangeSchedule}
      onBlurChange={handleBlurChange}
    />
  );
}

type RunButtonSectionProps = {
  job: TransformJob;
};

function RunButtonSection({ job }: RunButtonSectionProps) {
  const [executeJob] = useExecuteTransformJobMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeJob(job.id);
    if (error) {
      sendErrorToast(t`Failed to run job`);
    }
    return { error };
  };

  return <RunButton execution={job.last_execution} onRun={handleRun} />;
}
