import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { Button, Icon, Loader } from "metabase/ui";
import type { TransformExecution } from "metabase-types/api";

type RunButtonProps = {
  execution: TransformExecution | null | undefined;
  isLoading: boolean;
  onRun: () => void;
};

export function RunButton({ execution, isLoading, onRun }: RunButtonProps) {
  const [isRecent] = useState(false);
  const { label, color, leftSection, disabled } = getButtonInfo(
    execution,
    isLoading,
    isRecent,
  );

  return (
    <Button
      variant="filled"
      color={color}
      leftSection={leftSection}
      disabled={disabled}
      onClick={onRun}
    >
      {label}
    </Button>
  );
}

type ButtonInfo = {
  label: string;
  color?: string;
  leftSection?: ReactNode;
  disabled?: boolean;
};

function getButtonInfo(
  execution: TransformExecution | null | undefined,
  isLoading: boolean,
  isRecent: boolean,
): ButtonInfo {
  if (execution?.status === "started" || isLoading) {
    return {
      label: t`Running now…`,
      leftSection: <Loader size="sm" />,
      disabled: true,
    };
  }

  if (execution == null || !isRecent) {
    return {
      label: t`Run now`,
      leftSection: <Icon name="play_outlined" />,
    };
  }

  if (execution.status === "succeeded") {
    return {
      label: t`Ran successfully`,
      color: "success",
      leftSection: <Icon name="check" />,
    };
  }

  return {
    label: t`Run failed`,
    color: "error",
    leftSection: <Icon name="warning" />,
  };
}
