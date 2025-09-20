import { c, t } from "ttag";

import { Schedule } from "metabase/common/components/Schedule";
import { useSetting } from "metabase/common/hooks";
import { getScheduleExplanation } from "metabase/lib/cron";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Tooltip } from "metabase/ui";
import { useRunTransformJobMutation } from "metabase-enterprise/api";
import { trackTransformJobTriggerManualRun } from "metabase-enterprise/transforms/analytics";
import type {
  ScheduleDisplayType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { SplitSection } from "../../../components/SplitSection";
import type { TransformJobInfo } from "../types";

type ScheduleSectionProps = {
  job: TransformJobInfo;
  onScheduleChange: (
    schedule: string,
    scheduleDisplayType: ScheduleDisplayType,
  ) => void;
};

export function ScheduleSection({
  job,
  onScheduleChange,
}: ScheduleSectionProps) {
  return (
    <SplitSection
      label={t`Schedule`}
      description={t`Configure when this job should run.`}
    >
      <Box px="xl" py="lg">
        <ScheduleWidget job={job} onChangeSchedule={onScheduleChange} />
      </Box>
      <Divider />
      <Group px="xl" py="md" justify="end">
        <RunButtonSection job={job} />
      </Group>
    </SplitSection>
  );
}

type ScheduleWidgetProps = {
  job: TransformJobInfo;
  onChangeSchedule: (
    schedule: string,
    scheduleDisplayType: ScheduleDisplayType,
  ) => void;
};

const SCHEDULE_OPTIONS: ScheduleType[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
];

function ScheduleWidget({ job, onChangeSchedule }: ScheduleWidgetProps) {
  const verb = c("A verb in the imperative mood").t`Run`;
  const systemTimezone = useSetting("system-timezone") ?? "UTC";

  const renderScheduleDescription = (
    settings: ScheduleSettings,
    schedule: string,
  ) => {
    if (settings.schedule_type !== "cron") {
      return null;
    }

    const scheduleExplanation = getScheduleExplanation(schedule);
    if (scheduleExplanation == null) {
      return null;
    }

    return t`This job will run ${scheduleExplanation}, ${systemTimezone}`;
  };

  const handleChange = (schedule: string, settings: ScheduleSettings) => {
    onChangeSchedule(
      schedule,
      settings.schedule_type === "cron" ? "cron/raw" : "cron/builder",
    );
  };

  return (
    <Schedule
      cronString={job.schedule}
      scheduleOptions={SCHEDULE_OPTIONS}
      verb={verb}
      timezone={systemTimezone}
      isCustomSchedule={job.schedule_display_type === "cron/raw"}
      renderScheduleDescription={renderScheduleDescription}
      onScheduleChange={handleChange}
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
