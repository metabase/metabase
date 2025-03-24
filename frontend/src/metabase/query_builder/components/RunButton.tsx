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
  medium?: boolean;
  hidden?: boolean;
  onlyIcon?: boolean;
  iconSize?: number;
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
      ref={ref}
      className={cx(className, QueryBuilderS.RunButton, {
        [QueryBuilderS.RunButtonHidden]: hidden,
        [QueryBuilderS.RunButtonCircular]: circular,
        [CS.circular]: circular,
      })}
      classNames={{
        icon: QueryBuilderS.RunButtonIcon,
      }}
      icon={icon}
      primary={isDirty}
      data-testid="run-button"
      aria-label={ariaLabel}
      onClick={isRunning ? onCancel : onRun}
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
