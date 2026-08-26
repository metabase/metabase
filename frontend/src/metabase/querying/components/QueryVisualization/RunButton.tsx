import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { Icon, UnstyledButton } from "metabase/ui";

import S from "./RunButton.module.css";

export interface RunButtonProps {
  className?: string;
  isRunning: boolean;
  isDirty: boolean;
  circular?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  onlyIcon?: boolean;
  iconSize?: number;
  onRun?: () => void;
  onCancel?: () => void;
}

export const RunButton = forwardRef(function RunButton(
  {
    isRunning,
    isDirty,
    onRun,
    onCancel,
    className,
    circular,
    hidden,
    onlyIcon,
    iconSize = 16,
    ...props
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const icon = getButtonIcon(isRunning, isDirty);
  const ariaLabel = getButtonLabel(isRunning, isDirty);

  return (
    <UnstyledButton
      {...props}
      ref={ref}
      className={cx(S.root, className, {
        [S.primary]: isDirty,
        [S.white]: !isDirty,
        [S.onlyIcon]: onlyIcon,
        [S.circular]: circular,
        [S.hidden]: hidden,
      })}
      data-testid="run-button"
      aria-label={ariaLabel}
      onClick={isRunning ? onCancel : onRun}
    >
      <Icon className={S.icon} name={icon} size={iconSize} />
    </UnstyledButton>
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
