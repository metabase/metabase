import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Button from "metabase/components/Button";

import cx from "classnames";

export default class RunButton extends Component {
  static propTypes = {
    className: PropTypes.string,
    isRunnable: PropTypes.bool.isRequired,
    isRunning: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
    isPreviewing: PropTypes.bool,
    onRun: PropTypes.func.isRequired,
    onCancel: PropTypes.func,
  };

  static defaultProps = {};

  render() {
    const {
      isRunnable,
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
    } = this.props;
    let buttonText = null;
    let buttonIcon = null;
    if (isRunning) {
      buttonIcon = "close";
      if (!compact) {
        buttonText = t`Cancel`;
      }
    } else if (isRunnable && isDirty) {
      if (compact) {
        buttonIcon = "play";
      } else {
        buttonText = isPreviewing ? t`Get Preview` : t`Get Answer`;
      }
    } else if (isRunnable && !isDirty) {
      buttonIcon = "refresh";
    }
    if (!buttonIcon && !buttonText) {
      return null;
    }
    return (
      <Button
        {...props}
        icon={buttonIcon}
        primary={isDirty}
        iconSize={16}
        className={cx(className, "RunButton", {
          "RunButton--hidden": hidden,
          circular: circular,
        })}
        onClick={isRunning ? onCancel : onRun}
      >
        {buttonText}
      </Button>
    );
  }
}
