import { c, t } from "ttag";

import { useRunTransformJobMutation } from "metabase/api";
import { Schedule } from "metabase/common/components/Schedule";
import { useSetting } from "metabase/common/hooks";
import { getScheduleExplanation } from "metabase/lib/cron";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Tooltip } from "metabase/ui";
import type {
  ScheduleDisplayType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { trackTransformJobTriggerManualRun } from "../../../analytics";
import { RunButton } from "../../RunButton";
import { RunStatus } from "../../RunStatus";
import { TitleSection } from "../../TitleSection";
import type { TransformJobInfo } from "../types";

type ScheduleSectionProps = {
  job: TransformJobInfo;
  readOnly?: boolean;
  onScheduleChange: (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => void;
};

export function ScheduleSection({
  job,
  readOnly,
  onScheduleChange,
}: ScheduleSectionProps) {
  return (
    <TitleSection
      label={t`Schedule`}
      description={t`Configure when this job should run.`}
    >
      <Box px="xl" py="lg">
        <Box display="contents" component="fieldset" disabled={readOnly}>
          <ScheduleWidget job={job} onChangeSchedule={onScheduleChange} />
        </Box>
      </Box>
      <Divider />
      <Group px="xl" py="md" justify="space-between">
        <RunStatus
          run={job?.last_run ?? null}
          neverRunMessage={t`This job hasn’t been run before.`}
        />
        <RunButtonSection job={job} readOnly={readOnly} />
      </Group>
    </TitleSection>
  );
}

type ScheduleWidgetProps = {
  job: TransformJobInfo;
  onChangeSchedule: (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
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
      layout="horizontal"
      isCustomSchedule={job.ui_display_type === "cron/raw"}
      renderScheduleDescription={renderScheduleDescription}
      data-testid="schedule-picker"
      onScheduleChange={handleChange}
    />
  );
}

type RunButtonSectionProps = {
  job: TransformJobInfo;
  readOnly?: boolean;
};

function RunButtonSection({ job, readOnly }: RunButtonSectionProps) {
  const [runJob] = useRunTransformJobMutation();
  const { sendErrorToast } = useMetadataToasts();
  const isSaved = job.id != null;
  const hasTags = job.tag_ids?.length !== 0;

  const tooltipLabel = (() => {
    if (!hasTags) {
      return t`This job doesn't have tags to run.`;
    }
    if (readOnly) {
      return t`Sorry, you don't have permission to run one or more of this job's transforms.`;
    }
  })();

  const handleRun = async () => {
    if (job.id == null) {
      return;
    }

    trackTransformJobTriggerManualRun({ jobId: job.id });

    const { error } = await runJob(job.id);

    if (error) {
      sendErrorToast(t`Failed to run job`);
    }
  };

  return (
    <Tooltip label={tooltipLabel} disabled={!tooltipLabel}>
      <RunButton
        id={job.id}
        run={job.last_run}
        isDisabled={!isSaved || !hasTags || readOnly}
        onRun={handleRun}
      />
    </Tooltip>
  );
}
