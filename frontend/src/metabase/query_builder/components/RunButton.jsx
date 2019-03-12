import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class RunButton extends Component {
  static propTypes = {
    className: PropTypes.string,
    isRunnable: PropTypes.bool.isRequired,
    isRunning: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
    onRun: PropTypes.func.isRequired,
    onCancel: PropTypes.func,
  };

  render() {
    let {
      isRunnable,
      isRunning,
      isDirty,
      onRun,
      onCancel,
      className,
    } = this.props;
    let buttonText = null;
    if (isRunning) {
      buttonText = (
        <div className="flex align-center">
          <Icon className="sm-mr1" name="close" />
          <span className="hide sm-show">{t`Cancel`}</span>
        </div>
      );
    } else if (isRunnable && isDirty) {
      buttonText = t`Get Answer`;
    } else if (isRunnable && !isDirty) {
      buttonText = (
        <div className="flex align-center">
          <Icon className="sm-mr1" name="refresh" />
          <span className="hide sm-show">{t`Refresh`}</span>
        </div>
      );
    }
    return (
      <button
        className={cx(
          "Button Button--medium circular RunButton",
          {
            "RunButton--hidden": !buttonText,
            "Button--primary": isDirty,
            "text-medium": !isDirty,
            "text-brand-hover": !isDirty,
          },
          className,
        )}
        onClick={isRunning ? onCancel : onRun}
      >
        {buttonText}
      </button>
    );
  }
}
