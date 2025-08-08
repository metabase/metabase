import { type ReactNode, type Ref, forwardRef, useState } from "react";
import { useUpdateEffect } from "react-use";
import { t } from "ttag";

import { Button, Icon, Loader } from "metabase/ui";
import type { TransformExecution } from "metabase-types/api";

const RECENT_TIMEOUT = 5000;

type RunButtonProps = {
  execution: TransformExecution | null | undefined;
  isLoading: boolean;
  isDisabled?: boolean;
  onRun: () => void;
};

export const RunButton = forwardRef(function RunButton(
  {
    execution,
    isLoading,
    isDisabled: isExternallyDisabled = false,
    onRun,
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [isRecent, setIsRecent] = useState(false);
  const { label, color, leftSection, isDisabled } = getRunButtonInfo({
    execution,
    isLoading,
    isRecent,
    isDisabled: isExternallyDisabled,
  });

  useUpdateEffect(() => {
    setIsRecent(true);
    const timeoutId = setTimeout(() => setIsRecent(false), RECENT_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [execution]);

  return (
    <Button
      ref={ref}
      variant="filled"
      color={color}
      leftSection={leftSection}
      disabled={isDisabled}
      onClick={onRun}
    >
      {label}
    </Button>
  );
});

type RunButtonOpts = {
  execution: TransformExecution | null | undefined;
  isLoading: boolean;
  isRecent: boolean;
  isDisabled: boolean;
};

type RunButtonInfo = {
  label: string;
  color?: string;
  leftSection?: ReactNode;
  isDisabled?: boolean;
};

function getRunButtonInfo({
  execution,
  isLoading,
  isRecent,
  isDisabled,
}: RunButtonOpts): RunButtonInfo {
  if (execution?.status === "started" || isLoading) {
    return {
      label: t`Running now…`,
      leftSection: <Loader size="sm" />,
      isDisabled: true,
    };
  }

  if (execution == null || !isRecent || isDisabled) {
    return {
      label: t`Run now`,
      leftSection: <Icon name="play_outlined" />,
      isDisabled,
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
