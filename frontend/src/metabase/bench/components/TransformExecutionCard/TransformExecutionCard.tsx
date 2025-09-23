import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Card, Group, Icon, Stack, Text, Button, Loader, Tooltip } from "metabase/ui";
import {
  useRunTransformMutation,
  useCancelCurrentTransformRunMutation,
} from "metabase-enterprise/api";
import { trackTransformTriggerManualRun } from "metabase-enterprise/transforms/analytics";
import { parseTimestampWithTimezone } from "metabase-enterprise/transforms/utils";
import type { Transform, TransformRun } from "metabase-types/api";
import { useState, useEffect } from "react";

interface TransformExecutionCardProps {
  transform?: Transform;
}

export function TransformExecutionCard({ transform }: TransformExecutionCardProps) {
  const systemTimezone = useSetting("system-timezone");
  const [runTransform] = useRunTransformMutation();
  const [cancelTransform] = useCancelCurrentTransformRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [isRecentRun, setIsRecentRun] = useState(false);

  const lastRun = transform?.last_run;

  // Reset recent run indicator after 5 seconds
  useEffect(() => {
    if (lastRun?.status) {
      setIsRecentRun(true);
      const timeout = setTimeout(() => setIsRecentRun(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [lastRun?.status, lastRun?.end_time]);

  const handleRun = async () => {
    if (!transform) return;

    trackTransformTriggerManualRun({
      transformId: transform.id,
      triggeredFrom: "bench-workbench",
    });

    const { error } = await runTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
  };

  const handleCancel = async () => {
    if (!transform) return;

    const { error } = await cancelTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to cancel transform`);
    }
  };

  if (!transform) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed" size="sm">
          {t`Select a transform to see execution details`}
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Text fw="bold" size="sm">
          {t`Transform Execution`}
        </Text>

        <ExecutionStatus
          lastRun={lastRun}
          systemTimezone={systemTimezone}
          transformId={transform.id}
        />

        <RunButton
          lastRun={lastRun}
          isRecentRun={isRecentRun}
          onRun={handleRun}
          onCancel={handleCancel}
        />
      </Stack>
    </Card>
  );
}

interface ExecutionStatusProps {
  lastRun?: TransformRun | null;
  systemTimezone: string;
  transformId: number;
}

function ExecutionStatus({ lastRun, systemTimezone, transformId }: ExecutionStatusProps) {
  if (!lastRun) {
    return (
      <Group gap="sm">
        <Icon c="text-secondary" name="calendar" size="sm" />
        <Text size="sm" c="dimmed">
          {t`This transform hasn't been run before.`}
        </Text>
      </Group>
    );
  }

  const { status, end_time, message } = lastRun;
  const endTime = end_time ? parseTimestampWithTimezone(end_time, systemTimezone) : null;
  const endTimeText = endTime?.fromNow();

  switch (status) {
    case "started":
      return (
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm">
            {t`Run in progress…`}
          </Text>
        </Group>
      );

    case "succeeded":
      return (
        <Group gap="sm">
          <Icon c="success" name="check_filled" size="sm" />
          <Text size="sm">
            {endTimeText
              ? t`Last ran ${endTimeText} successfully.`
              : t`Last ran successfully.`
            }
          </Text>
        </Group>
      );

    case "failed":
      return (
        <Stack gap="xs">
          <Group gap="sm">
            <Icon c="error" name="warning" size="sm" />
            <Text size="sm">
              {endTimeText
                ? t`Last run failed ${endTimeText}.`
                : t`Last run failed.`
              }
            </Text>
          </Group>
          {message && (
            <Text size="xs" c="error" style={{ marginLeft: "20px" }}>
              {message}
            </Text>
          )}
        </Stack>
      );

    case "timeout":
      return (
        <Stack gap="xs">
          <Group gap="sm">
            <Icon c="error" name="warning" size="sm" />
            <Text size="sm">
              {endTimeText
                ? t`Last run timed out ${endTimeText}.`
                : t`Last run timed out.`
              }
            </Text>
          </Group>
          {message && (
            <Text size="xs" c="error" style={{ marginLeft: "20px" }}>
              {message}
            </Text>
          )}
        </Stack>
      );

    case "canceling":
      return (
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm">
            {t`Canceling…`}
          </Text>
        </Group>
      );

    case "canceled":
      return (
        <Group gap="sm">
          <Icon c="text-secondary" name="close" size="sm" />
          <Text size="sm">
            {endTimeText
              ? t`Last run was canceled ${endTimeText}.`
              : t`Last run was canceled.`
            }
          </Text>
        </Group>
      );

    default:
      return null;
  }
}

interface RunButtonProps {
  lastRun?: TransformRun | null;
  isRecentRun: boolean;
  onRun: () => void;
  onCancel: () => void;
}

function RunButton({ lastRun, isRecentRun, onRun, onCancel }: RunButtonProps) {
  const isRunning = lastRun?.status === "started";
  const isCanceling = lastRun?.status === "canceling";

  if (isRunning) {
    return (
      <Group>
        <Button
          variant="filled"
          leftSection={<Loader size="sm" />}
          disabled
        >
          {t`Running now…`}
        </Button>
        <Tooltip label={t`Cancel`}>
          <Button
            variant="outline"
            onClick={onCancel}
            leftSection={<Icon name="close" />}
          >
            {t`Cancel`}
          </Button>
        </Tooltip>
      </Group>
    );
  }

  if (isCanceling) {
    return (
      <Button
        variant="filled"
        leftSection={<Loader size="sm" />}
        disabled
      >
        {t`Canceling…`}
      </Button>
    );
  }

  if (isRecentRun && lastRun) {
    let buttonProps = {};

    switch (lastRun.status) {
      case "succeeded":
        buttonProps = {
          color: "green",
          leftSection: <Icon name="check" />,
          children: t`Ran successfully`
        };
        break;
      case "failed":
      case "timeout":
        buttonProps = {
          color: "red",
          leftSection: <Icon name="warning" />,
          children: t`Run failed`
        };
        break;
      case "canceled":
        buttonProps = {
          variant: "outline",
          leftSection: <Icon name="close" />,
          children: t`Canceled`
        };
        break;
      default:
        buttonProps = {
          leftSection: <Icon name="play_outlined" />,
          children: t`Run now`
        };
    }

    return (
      <Button
        {...buttonProps}
        onClick={onRun}
      />
    );
  }

  return (
    <Button
      leftSection={<Icon name="play_outlined" />}
      onClick={onRun}
    >
      {t`Run now`}
    </Button>
  );
}
