import React, { forwardRef, Ref } from "react";
import { t } from "ttag";
import cx from "classnames";
import Button from "metabase/core/components/Button";

interface RunButtonProps {
  className?: string;
  isRunning: boolean;
  isDirty: boolean;
  compact?: boolean;
  circular?: boolean;
  borderless?: boolean;
  hidden?: boolean;
  onRun: () => void;
  onCancel?: () => void;
}

const RunButton = forwardRef(function RunButton(
  {
    isRunning,
    isDirty,
    onRun,
    onCancel,
    className,
    compact,
    circular,
    hidden,
    ...props
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  let buttonText = null;
  let buttonIcon = null;
  if (isRunning) {
    buttonIcon = "close";
    if (!compact) {
      buttonText = t`Cancel`;
    }
  } else if (isDirty) {
    if (compact) {
      buttonIcon = "play";
    } else {
      buttonText = t`Get Answer`;
    }
  } else {
    buttonIcon = "refresh";
  }
  return (
    <Button
      {...props}
      icon={buttonIcon}
      primary={isDirty}
      iconSize={16}
      className={cx(className, "RunButton", {
        "RunButton--hidden": hidden,
        "RunButton--compact": circular && !props.borderless && compact,
        circular: circular,
      })}
      onClick={isRunning ? onCancel : onRun}
      ref={ref}
    >
      {buttonText}
    </Button>
  );
});

export default RunButton;
