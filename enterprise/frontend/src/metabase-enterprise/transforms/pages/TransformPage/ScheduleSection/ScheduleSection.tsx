import dayjs from "dayjs";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Divider,
  Group,
  Icon,
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
      description={t`It can either be run on the schedule you set on the overview page, or only when you click the “run now” button.`}
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
    { value: "global-schedule" as const, label: t`On the schedule` },
    { value: "none" as const, label: t`Manually only` },
  ];
}

type ExecuteStatusProps = {
  transform: Transform;
};

function ExecuteStatus({ transform }: ExecuteStatusProps) {
  return (
    <Group c="text-secondary" gap="sm">
      <Icon name="calendar" />
      <Text>{getStatusText(transform)}</Text>
    </Group>
  );
}

function getStatusText({
  execution_status: status,
  last_ended_at: lastEndedAt,
}: Transform) {
  const lastEndedAtText =
    lastEndedAt != null
      ? dayjs.parseZone(lastEndedAt).local().format("lll")
      : null;

  return match(status)
    .with("never-executed", () => t`This transform hasn’t run yet.`)
    .with("started", () => t`In progress…`)
    .with("exec-succeeded", "sync-succeeded", () =>
      lastEndedAtText ? t`Last run ${lastEndedAtText}` : t`Last run succeeded`,
    )
    .with("exec-failed", "sync-failed", () =>
      lastEndedAtText
        ? t`Last run failed at ${lastEndedAtText}`
        : t`Last run failed`,
    )
    .otherwise(() => null);
}

type ExecuteButtonProps = {
  transform: Transform;
};

function ExecuteButton({ transform }: ExecuteButtonProps) {
  const [executeTransform, { isLoading }] = useExecuteTransformMutation();
  const { sendErrorToast } = useMetadataToasts();
  const isStarted = transform.execution_status === "started";
  const isRunning = isLoading || isStarted;

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
  };

  return (
    <Button
      loading={isRunning}
      leftSection={<Icon name="play_outlined" />}
      disabled={isRunning}
      onClick={handleRun}
    >
      {t`Run now`}
    </Button>
  );
}
