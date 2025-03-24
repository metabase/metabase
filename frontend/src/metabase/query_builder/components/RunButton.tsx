import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

interface RunButtonProps {
  className?: string;
  isRunning: boolean;
  isDirty: boolean;
  circular?: boolean;
  hidden?: boolean;
  onRun?: () => void;
  onCancel?: () => void;
}

const RunButton = forwardRef(function RunButton(
  {
    isRunning,
    isDirty,
    onRun,
    onCancel,
    className,
    circular,
    hidden,
    ...props
  }: RunButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const icon = getButtonIcon(isRunning, isDirty);
  const ariaLabel = getButtonLabel(isRunning, isDirty);

  return (
    <Button
      {...props}
      icon={icon}
      primary={isDirty}
      className={cx(className, QueryBuilderS.RunButton, {
        [QueryBuilderS.RunButtonHidden]: hidden,
        [QueryBuilderS.RunButtonCircular]: circular,
        [CS.circular]: circular,
      })}
      data-testid="run-button"
      onClick={isRunning ? onCancel : onRun}
      ref={ref}
      aria-label={ariaLabel}
    />
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
