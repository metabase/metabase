import { type ReactNode, type Ref, forwardRef, useState } from "react";
import { useUpdateEffect } from "react-use";
import { t } from "ttag";

import { Button, Icon, Loader, Tooltip } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

const RECENT_TIMEOUT = 5000;

type RunButtonProps = {
  run: TransformRun | null | undefined;
  isLoading: boolean;
  isDisabled?: boolean;
  isCancelling?: boolean;
  allowCancellation?: boolean;
  onRun: () => void;
  onCancel?: () => void;
};

export const RunButton = forwardRef(function RunButton(
  {
    run,
    isLoading,
    isCancelling,
    isDisabled: isExternallyDisabled = false,
    onRun,
    onCancel,
    allowCancellation = false,
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [isRecent, setIsRecent] = useState(false);
  const { label, color, leftSection, isDisabled } = getRunButtonInfo({
    run,
    isLoading,
    isRecent,
    isDisabled: isExternallyDisabled,
  });

  useUpdateEffect(() => {
    setIsRecent(true);
    const timeoutId = setTimeout(() => setIsRecent(false), RECENT_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [run]);

  const isRunning = run?.status === "started" || isLoading;

  return (
    <Button.Group>
      <Button
        ref={ref}
        variant="filled"
        color={color}
        leftSection={leftSection}
        disabled={isDisabled}
        data-testid="run-button"
        onClick={onRun}
      >
        {label}
      </Button>
      {allowCancellation && isRunning && (
        <Tooltip label={t`Cancel`}>
          <Button
            onClick={onCancel}
            disabled={isCancelling}
            rightSection={<Icon name="close" aria-hidden />}
          />
        </Tooltip>
      )}
    </Button.Group>
  );
});

type RunButtonOpts = {
  run: TransformRun | null | undefined;
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
  run,
  isLoading,
  isRecent,
  isDisabled,
}: RunButtonOpts): RunButtonInfo {
  if (run?.status === "started" || isLoading) {
    return {
      label: t`Running now…`,
      leftSection: <Loader size="sm" />,
      isDisabled: true,
    };
  }

  if (run == null || !isRecent || isDisabled) {
    return {
      label: t`Run now`,
      leftSection: <Icon name="play_outlined" aria-hidden />,
      isDisabled,
    };
  }

  if (run.status === "succeeded") {
    return {
      label: t`Ran successfully`,
      color: "success",
      leftSection: <Icon name="check" aria-hidden />,
      isDisabled,
    };
  }

  return {
    label: t`Run failed`,
    color: "error",
    leftSection: <Icon name="warning" aria-hidden />,
    isDisabled,
  };
}
