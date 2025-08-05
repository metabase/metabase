import dayjs from "dayjs";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Divider,
  Group,
  Icon,
  Loader,
  SegmentedControl,
  Text,
} from "metabase/ui";
import {
  useExecuteTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import type { Transform, TransformExecutionTrigger } from "metabase-types/api";

type ScheduleSectionProps = {
  transform: Transform;
};

export function ScheduleSection({ transform }: ScheduleSectionProps) {
  return (
    <CardSection
      label={t`When to run this transform`}
      description={t`Run it on a schedule, or only when you click “Run now.”`}
    >
      <Group p="lg">
        <ExecutionTriggerControl transform={transform} />
      </Group>
      <Divider />
      <Group p="lg" justify="space-between">
        <ExecuteStatus transform={transform} />
        <ExecuteButton transform={transform} />
      </Group>
    </CardSection>
  );
}

type ExecutionTriggerControlProps = {
  transform: Transform;
};

function ExecutionTriggerControl({ transform }: ExecutionTriggerControlProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast, sendUndoToast } =
    useMetadataToasts();

  const handleChange = async (newValue: TransformExecutionTrigger) => {
    const { error } = await updateTransform({
      id: transform.id,
      execution_trigger: newValue,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform schedule`);
    } else {
      sendSuccessToast(t`Transform schedule updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          execution_trigger: transform.execution_trigger,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <SegmentedControl
      value={transform.execution_trigger}
      data={getExecutionTriggerOptions()}
      onChange={handleChange}
    />
  );
}

function getExecutionTriggerOptions() {
  return [
    { value: "global-schedule" as const, label: t`Scheduled` },
    { value: "none" as const, label: t`Manually` },
  ];
}

type ExecuteStatusProps = {
  transform: Transform;
};

function ExecuteStatus({ transform }: ExecuteStatusProps) {
  const isFailed = transform?.last_execution?.status === "failed";

  return (
    <Group gap="sm">
      <Icon
        c={isFailed ? "warning" : "text-secondary"}
        name={isFailed ? "warning" : "calendar"}
      />
      <Text c="text-secondary">{getStatusText(transform)}</Text>
    </Group>
  );
}

function getStatusText({ last_execution }: Transform) {
  if (last_execution == null) {
    return t`This transform hasn’t run yet.`;
  }

  const { status, end_time } = last_execution;
  const endTimeText =
    end_time != null ? dayjs.parseZone(end_time).local().format("lll") : null;

  switch (status) {
    case "started":
      return t`In progress…`;
    case "succeeded":
      return endTimeText ? t`Last run ${endTimeText}` : t`Last run succeeded`;
    case "failed":
      return endTimeText
        ? t`Last run failed at ${endTimeText}`
        : t`Last run failed`;
    case "timeout":
      return endTimeText
        ? t`Last run timed out at ${endTimeText}`
        : t`Last run timed out`;
  }
}

type ExecuteButtonProps = {
  transform: Transform;
};

function ExecuteButton({ transform }: ExecuteButtonProps) {
  const [executeTransform] = useExecuteTransformMutation();
  const isRunning = transform.last_execution?.status === "started";
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
  };

  return (
    <Button
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
