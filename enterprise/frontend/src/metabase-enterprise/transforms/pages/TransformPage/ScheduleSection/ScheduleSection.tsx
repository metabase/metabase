import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Divider, Group, Icon, SegmentedControl } from "metabase/ui";
import { useExecuteTransformMutation } from "metabase-enterprise/api";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import type { Transform } from "metabase-types/api";

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
  return (
    <SegmentedControl
      value={transform.execution_trigger}
      data={getExecutionTriggerOptions()}
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
