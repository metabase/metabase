import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import { useSetting } from "metabase/common/hooks";
import { formatCronExpressionForUI } from "metabase/lib/cron";
import { timezoneToUTCOffset } from "metabase/lib/time-dayjs";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Icon, Stack, Tooltip } from "metabase/ui";
import { useRunTransformJobMutation } from "metabase-enterprise/api";
import { trackTranformJobTriggerManualRun } from "metabase-enterprise/transforms/analytics";

import { RunButton } from "../../../components/RunButton";
import { RunErrorInfo } from "../../../components/RunErrorInfo";
import { SplitSection } from "../../../components/SplitSection";
import { parseTimestampWithTimezone } from "../../../utils";
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
  return (
    <SplitSection
      label={t`Schedule`}
      description={t`Use cron syntax to set this job’s schedule.`}
    >
      <CronSection
        schedule={schedule}
        onChangeSchedule={setSchedule}
        onChangeSubmit={onScheduleChange}
      />

      <Divider />
      <Group px="xl" py="md" justify="space-between">
        <RunStatusSection job={job} />
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
  const systemTimezone = useSetting("system-timezone") ?? "UTC";
  const timezoneOffset = timezoneToUTCOffset(systemTimezone);
  const timezoneExplanation =
    timezoneOffset === "+00:00" ? "UTC" : `UTC${timezoneOffset}`;

  return (
    <Stack px="xl" py="lg">
      <CronExpressionInput
        value={schedule}
        onChange={onChangeSchedule}
        onBlurChange={onChangeSubmit}
        getExplainMessage={(explanation) => (
          <Group gap="sm" c="text-secondary" pt="sm">
            <Icon name="calendar" />
            {t`This job will run ${explanation}, ${timezoneExplanation}`}
          </Group>
        )}
      />
    </Stack>
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

    trackTranformJobTriggerManualRun({
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

type RunStatusSectionProps = {
  job: TransformJobInfo;
};

function RunStatusSection({ job }: RunStatusSectionProps) {
  const { last_run } = job;
  const systemTimezone = useSetting("system-timezone");

  if (last_run == null) {
    return (
      <Group gap="sm">
        <Icon c="text-secondary" name="calendar" />
        <Box>{t`This job hasn’t been run before.`}</Box>
      </Group>
    );
  }

  const { status, end_time, message } = last_run;
  const endTime =
    end_time != null
      ? parseTimestampWithTimezone(end_time, systemTimezone)
      : null;
  const endTimeText = endTime != null ? endTime.fromNow() : null;

  const errorInfo =
    message != null ? (
      <RunErrorInfo
        message={message}
        endTime={endTime ? endTime.toDate() : null}
      />
    ) : null;

  switch (status) {
    case "started":
      return (
        <Group gap="sm">
          <Icon c="text-primary" name="sync" />
          <Box>{t`Run in progress…`}</Box>
        </Group>
      );
    case "succeeded":
      return (
        <Group gap="sm">
          <Icon c="success" name="check_filled" />
          <Box>
            {endTimeText
              ? t`Last ran ${endTimeText} successfully.`
              : t`Last ran successfully.`}
          </Box>
        </Group>
      );
    case "failed":
      return (
        <Group gap={0}>
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run failed ${endTimeText}.`
              : t`Last run failed.`}
          </Box>
          {errorInfo}
        </Group>
      );
    case "timeout":
      return (
        <Group gap={0}>
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run timed out ${endTimeText}.`
              : t`Last run timed out.`}
          </Box>
          {errorInfo}
        </Group>
      );
    default:
      return null;
  }
}
