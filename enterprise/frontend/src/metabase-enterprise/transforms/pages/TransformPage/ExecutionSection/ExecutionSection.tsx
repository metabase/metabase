import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Divider, Group, Icon, Loader, Text } from "metabase/ui";
import { useExecuteTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";

import { getStatusInfo } from "./utils";

type ScheduleSectionProps = {
  transform: Transform;
};

export function ExecutionSection({ transform }: ScheduleSectionProps) {
  return (
    <SplitSection
      label={t`Run this transform`}
      description={t`This transform will be run whenever the jobs it belongs to are scheduled.`}
    >
      <Group p="lg" justify="space-between">
        <ExecuteStatus transform={transform} />
        <ExecuteButton transform={transform} />
      </Group>
      <Divider />
    </SplitSection>
  );
}

type ExecuteStatusProps = {
  transform: Transform;
};

function ExecuteStatus({ transform }: ExecuteStatusProps) {
  const { message, icon, color } = getStatusInfo(transform);

  return (
    <Group gap="sm">
      <Icon name={icon} c={color} />
      <Text>{message}</Text>
    </Group>
  );
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
