import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import {
  formatCronExpressionForAPI,
  formatCronExpressionForUI,
  getScheduleExplanation,
} from "metabase/lib/cron";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Divider, Group, Icon, Loader } from "metabase/ui";
import {
  useExecuteTransformJobMutation,
  useUpdateTransformJobMutation,
} from "metabase-enterprise/api";
import type { TransformJob } from "metabase-types/api";

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
      <Box p="lg">
        <CronSection
          job={job}
          schedule={schedule}
          onChangeSchedule={setSchedule}
        />
      </Box>
      <Divider />
      <Group p="lg" justify={scheduleExplanation ? "space-between" : "end"}>
        {scheduleExplanation != null && (
          <Group>
            <Icon name="calendar" />
            <Box c="text-secondary">
              {t`This job will run ${scheduleExplanation}`}
            </Box>
          </Group>
        )}
        <RunButton job={job} />
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
      schedule: formatCronExpressionForAPI(newSchedule),
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

type RunButtonProps = {
  job: TransformJob;
};

function RunButton({ job }: RunButtonProps) {
  const [executeJob] = useExecuteTransformJobMutation();
  const isRunning = job.last_execution?.status === "started";
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeJob(job.id);
    if (error) {
      sendErrorToast(t`Failed to run job`);
    }
  };

  return (
    <Button
      variant="filled"
      leftSection={
        isRunning ? <Loader size="sm" /> : <Icon name="play_outlined" />
      }
      disabled={isRunning}
      onClick={handleRun}
    >
      {isRunning ? t`Running now…` : t`Run now`}
    </Button>
  );
}
