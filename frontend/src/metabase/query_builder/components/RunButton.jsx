import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class RunButton extends Component {
  static propTypes = {
    isRunnable: PropTypes.bool.isRequired,
    isRunning: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
    onRun: PropTypes.func.isRequired,
    onCancel: PropTypes.func,
  };

  render() {
    let { isRunnable, isRunning, isDirty, onRun, onCancel } = this.props;
    let buttonText = null;
    if (isRunning) {
      buttonText = (
        <div className="flex align-center">
          <Icon className="mr1" name="close" />
          {t`Cancel`}
        </div>
      );
    } else if (isRunnable && isDirty) {
      buttonText = t`Get Answer`;
    } else if (isRunnable && !isDirty) {
      buttonText = (
        <div className="flex align-center">
          <Icon className="mr1" name="refresh" />
          {t`Refresh`}
        </div>
      );
    }
    let actionFn = isRunning ? onCancel : onRun;
    let classes = cx(
      "Button Button--medium circular RunButton ml-auto mr-auto block",
      {
        "RunButton--hidden": !buttonText,
        "Button--primary": isDirty,
        "text-light": !isDirty,
        "text-medium-hover": !isDirty,
      },
    );
    return (
      <button className={classes} onClick={() => actionFn()}>
        {buttonText}
      </button>
    );
  }
}
