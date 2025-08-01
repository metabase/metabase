import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Divider, Group, Icon, SegmentedControl } from "metabase/ui";
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
      <Group p="lg" justify="end">
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

type ExecuteButtonProps = {
  transform: Transform;
};

function ExecuteButton({ transform }: ExecuteButtonProps) {
  const [executeTransform, { isLoading }] = useExecuteTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to schedule transform run`);
    } else {
      sendSuccessToast(t`Transform run scheduled`);
    }
  };

  return (
    <Button
      leftSection={<Icon name="play_outlined" />}
      disabled={isLoading}
      onClick={handleRun}
    >
      {t`Run now`}
    </Button>
  );
}
