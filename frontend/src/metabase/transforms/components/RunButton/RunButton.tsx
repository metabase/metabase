import {
  type ReactNode,
  type Ref,
  forwardRef,
  useLayoutEffect,
  useState,
} from "react";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { Button, type ButtonProps, Icon, Loader, Tooltip } from "metabase/ui";
import type {
  TransformId,
  TransformJobId,
  TransformRun,
} from "metabase-types/api";

const RECENT_TIMEOUT = 5000;

type RunButtonProps = {
  id: TransformId | TransformJobId | undefined;
  run: TransformRun | null | undefined;
  isDisabled?: boolean;
  allowCancellation?: boolean;
  size?: ButtonProps["size"];
  onRun: () => void;
  onCancel?: () => void;
};

export const RunButton = forwardRef(function RunButton(
  {
    id,
    run,
    isDisabled: isExternallyDisabled = false,
    allowCancellation = false,
    size = "md",
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

  useLayoutEffect(() => {
    setIsRecent(true);
    const timeoutId = setTimeout(() => setIsRecent(false), RECENT_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [run]);

  useLayoutEffect(() => {
    setIsRecent(false);
  }, [id]);

  return (
    <Button.Group>
      <Button
        ref={ref}
        variant="filled"
        color={color}
        leftSection={leftSection}
        disabled={isDisabled}
        data-testid="run-button"
        size={size}
        onClick={onRun}
      >
        {label}
      </Button>
      {allowCancellation && run?.status === "started" && (
        <Tooltip label={t`Cancel`}>
          <Button
            onClick={onCancel}
            rightSection={<Icon name="close" aria-hidden />}
            data-testid="cancel-button"
          />
        </Tooltip>
      )}
    </Button.Group>
  );
});

type RunButtonOpts = {
  run: TransformRun | null | undefined;
  isRecent: boolean;
  isDisabled: boolean;
};

type RunButtonInfo = {
  label: string;
  color?: ColorName;
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

  if (run?.status === "canceling") {
    return {
      label: t`Canceling…`,
      leftSection: <Loader size="sm" />,
      color: "text-secondary",
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

  if (run.status === "canceled") {
    return {
      label: t`Canceled`,
      color: "warning",
      leftSection: <Icon name="close" c="white" aria-hidden />,
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
