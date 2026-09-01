import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import {
  useCancelJobRunMutation,
  useRunTransformJobMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  Schedule,
  cronToBuilderValue,
} from "metabase/common/components/Schedule";
import type {
  ScheduleBuilderValue,
  ScheduleValue,
  ScheduleValueType,
} from "metabase/common/components/Schedule/domain";
import { isScheduleCronValue } from "metabase/common/components/Schedule/domain";
import type { ScheduleChangeEvent } from "metabase/common/components/Schedule/types";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { Box, Divider, Group, Tooltip } from "metabase/ui";
import { getScheduleExplanation } from "metabase/utils/cron";
import { isResourceNotFoundError } from "metabase/utils/errors";
import type { ScheduleDisplayType } from "metabase-types/api";

import { trackTransformJobTriggerManualRun } from "../../../analytics";
import { RunButton } from "../../RunButton";
import { RunStatus } from "../../RunStatus";
import type { TransformJobInfo } from "../types";

type ScheduleSectionProps = {
  job: TransformJobInfo;
  readOnly?: boolean;
  isCheckingPermissions?: boolean;
  onScheduleChange: (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => void;
};

export function ScheduleSection({
  job,
  readOnly,
  isCheckingPermissions,
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
        <RunButtonSection
          job={job}
          readOnly={readOnly}
          isCheckingPermissions={isCheckingPermissions}
        />
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

const SCHEDULE_OPTIONS: ScheduleValueType[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
];

const DEFAULT_SETTINGS: ScheduleBuilderValue = {
  schedule_type: "hourly",
  schedule_minute: 0,
};

function ScheduleWidget({ job, onChangeSchedule }: ScheduleWidgetProps) {
  const verb = c("A verb in the imperative mood").t`Run`;
  const systemTimezone = useSetting("system-timezone") ?? "UTC";

  const renderScheduleDescription = (
    value: ScheduleValue,
    cronString: string,
  ) => {
    if (!isScheduleCronValue(value)) {
      return null;
    }

    const scheduleExplanation = getScheduleExplanation(cronString);
    if (scheduleExplanation == null) {
      return null;
    }

    return t`This job will run ${scheduleExplanation}, ${systemTimezone}`;
  };

  const value: ScheduleValue =
    job.ui_display_type === "cron/raw"
      ? { schedule_type: "cron", cron: job.schedule }
      : (cronToBuilderValue(job.schedule) ?? DEFAULT_SETTINGS);

  const handleChange = ({ value, cronString }: ScheduleChangeEvent) => {
    if (!cronString) {
      return;
    }
    onChangeSchedule(
      cronString,
      isScheduleCronValue(value) ? "cron/raw" : "cron/builder",
    );
  };

  return (
    <Schedule
      value={value}
      scheduleOptions={SCHEDULE_OPTIONS}
      verb={verb}
      timezone={systemTimezone}
      layout="horizontal"
      renderScheduleDescription={renderScheduleDescription}
      data-testid="schedule-picker"
      onScheduleChange={handleChange}
    />
  );
}

type RunButtonSectionProps = {
  job: TransformJobInfo;
  readOnly?: boolean;
  isCheckingPermissions?: boolean;
};

function RunButtonSection({
  job,
  readOnly,
  isCheckingPermissions,
}: RunButtonSectionProps) {
  const [runJob] = useRunTransformJobMutation();
  const [cancelJobRun] = useCancelJobRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [
    isCancelModalOpen,
    { open: openCancelModal, close: closeCancelModal },
  ] = useDisclosure(false);
  const isSaved = job.id != null;
  const hasTags = job.tag_ids?.length !== 0;

  const tooltipLabel = (() => {
    if (isCheckingPermissions) {
      return t`Checking permissions…`;
    }
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

  const handleCancel = async () => {
    if (job.id == null || job.last_run?.id == null) {
      return;
    }
    const { error } = await cancelJobRun({
      jobId: job.id,
      runId: job.last_run.id,
    });
    if (error && !isResourceNotFoundError(error)) {
      sendErrorToast(t`Failed to cancel job`);
    }
  };

  return (
    <>
      <Tooltip label={tooltipLabel} disabled={!tooltipLabel}>
        <RunButton
          id={job.id}
          run={job.last_run}
          isDisabled={!isSaved || !hasTags || readOnly}
          isLoading={isCheckingPermissions}
          allowCancellation
          onRun={handleRun}
          onCancel={openCancelModal}
        />
      </Tooltip>
      <ConfirmModal
        title={t`Cancel this run?`}
        message={t`This stops the job run and requests cancellation of any transforms still in progress. Transforms that have already finished won't be reverted.`}
        confirmButtonText={t`Cancel run`}
        closeButtonText={t`Keep running`}
        opened={isCancelModalOpen}
        onClose={closeCancelModal}
        onConfirm={() => {
          void handleCancel();
          closeCancelModal();
        }}
      />
    </>
  );
}
