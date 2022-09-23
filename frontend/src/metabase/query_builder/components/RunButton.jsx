/* eslint-disable react/prop-types */
import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import cx from "classnames";
import Button from "metabase/core/components/Button";

const propTypes = {
  className: PropTypes.string,
  isRunning: PropTypes.bool.isRequired,
  isDirty: PropTypes.bool.isRequired,
  onRun: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
};

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
  },
  ref,
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

RunButton.propTypes = propTypes;

export default RunButton;
