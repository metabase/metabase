import { type ReactNode, useState } from "react";
import { useUpdateEffect } from "react-use";
import { t } from "ttag";

import { Button, Icon, Loader } from "metabase/ui";
import type { TransformExecution } from "metabase-types/api";

const RECENT_TIMEOUT = 5000;

type RunInfo = {
  error?: unknown;
};

type RunButtonProps = {
  execution: TransformExecution | null | undefined;
  onRun: () => Promise<RunInfo>;
};

export function RunButton({ execution, onRun }: RunButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRecent, setIsRecent] = useState(false);
  const { label, color, leftSection, disabled } = getButtonInfo(
    execution,
    isLoading,
    isRecent,
  );

  const handleClick = async () => {
    setIsLoading(true);
    const { error } = await onRun();
    if (error != null) {
      setIsLoading(false);
    }
  };

  useUpdateEffect(() => {
    setIsLoading(false);
    setIsRecent(true);
    const timeoutId = setTimeout(() => setIsRecent(false), RECENT_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [execution]);

  return (
    <Button
      variant="filled"
      color={color}
      leftSection={leftSection}
      disabled={disabled}
      onClick={handleClick}
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
