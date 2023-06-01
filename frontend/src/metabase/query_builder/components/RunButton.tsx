import { forwardRef, Ref } from "react";
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
  const icon = getButtonIcon(isRunning, isDirty);
  const ariaLabel = getButtonLabel(isRunning, isDirty);
  const buttonLabel = compact || (!isRunning && !isDirty) ? null : ariaLabel;

  return (
    <Button
      {...props}
      icon={icon}
      primary={isDirty}
      iconSize={16}
      className={cx(className, "RunButton", {
        "RunButton--hidden": hidden,
        "RunButton--compact": circular && !props.borderless && compact,
        circular: circular,
      })}
      onClick={isRunning ? onCancel : onRun}
      ref={ref}
      aria-label={ariaLabel}
    >
      {buttonLabel}
    </Button>
  );
});

const getButtonLabel = (isRunning: boolean, isDirty: boolean) => {
  if (isRunning) {
    return t`Cancel`;
  }

  if (isDirty) {
    return t`Get Answer`;
  }

  return t`Refresh`;
};

const getButtonIcon = (isRunning: boolean, isDirty: boolean) => {
  if (isRunning) {
    return "close";
  }
  if (isDirty) {
    return "play";
  }

  return "refresh";
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RunButton;
