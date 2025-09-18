import { type ReactNode, type Ref, forwardRef, useState } from "react";
import { useUpdateEffect } from "react-use";
import { t } from "ttag";

import { Button, Group, Icon, Loader } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

const RECENT_TIMEOUT = 5000;

type RunButtonProps = {
  run: TransformRun | null | undefined;
  isLoading?: boolean;
  isDisabled?: boolean;
  onRun: () => void;
  onCancel?: () => void;
  isCanceling?: boolean;
};

export const RunButton = forwardRef(function RunButton(
  {
    run,
    isLoading,
    isDisabled: isExternallyDisabled = false,
    onRun,
    onCancel,
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [isRecent, setIsRecent] = useState(false);
  const { label, color, leftSection, isDisabled } = getRunButtonInfo({
    run,
    isRecent,
    isDisabled: isExternallyDisabled,
  });

  useUpdateEffect(() => {
    setIsRecent(true);
    const timeoutId = setTimeout(() => setIsRecent(false), RECENT_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [run]);

  const showCancelButton = (run?.status === "started" || isLoading) && onCancel;

  if (showCancelButton) {
    return (
      <Group gap="sm">
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
      </Group>
    );
  }

  return (
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
  );
});

type RunButtonOpts = {
  run: TransformRun | null | undefined;
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
  isRecent,
  isDisabled,
}: RunButtonOpts): RunButtonInfo {
  if (run?.status === "started") {
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
