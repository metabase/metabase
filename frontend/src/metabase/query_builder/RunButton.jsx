import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class RunButton extends Component {
    static propTypes = {
        canRun: PropTypes.bool.isRequired,
        isRunning: PropTypes.bool.isRequired,
        isDirty: PropTypes.bool.isRequired,
        runFn: PropTypes.func.isRequired,
        cancelFn: PropTypes.func
    };

    render() {
        let { canRun, isRunning, isDirty, runFn, cancelFn } = this.props;
        let buttonText = null;
        if (isRunning) {
            buttonText = <div className="flex align-center"><Icon className="mr1" name="close" />Cancel</div>;
        } else if (canRun && isDirty) {
            buttonText = "Get Answer";
        } else if (canRun && !isDirty) {
            buttonText = <div className="flex align-center"><Icon className="mr1" name="refresh" />Refresh</div>;
        }
        let actionFn = isRunning ? cancelFn : runFn;
        let classes = cx("Button Button--medium circular RunButton", {
            "RunButton--hidden": !buttonText,
            "Button--primary": isDirty,
            "text-grey-2": !isDirty,
            "text-grey-4-hover": !isDirty,
        });
        return (
            <button className={classes} onClick={actionFn}>
            {buttonText}
            </button>
        );
    }
}
