/* eslint-disable react/prop-types */
import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import cx from "classnames";

const propTypes = {
  className: PropTypes.string,
  isRunning: PropTypes.bool.isRequired,
  isDirty: PropTypes.bool.isRequired,
  isPreviewing: PropTypes.bool,
  onRun: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
};

const RunButton = forwardRef(function RunButton(
  {
    isRunning,
    isDirty,
    isPreviewing,
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
      buttonText = isPreviewing ? t`Get Preview` : t`Get Answer`;
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
