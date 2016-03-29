import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class RunButton extends Component {
    static propTypes = {
        canRun: PropTypes.bool.isRequired,
        isRunning: PropTypes.bool.isRequired,
        isDirty: PropTypes.bool.isRequired,
        runFn: PropTypes.func.isRequired
    };

    render() {
        var runButtonText = (this.props.isRunning) ? "Loading..." : "Get Answer";
        var classes = cx({
            "Button": true,
            "Button--primary": true,
            "circular": true,
            "RunButton": true,
            "RunButton--hidden": (!this.props.canRun || !this.props.isDirty)
        });
        return (
            <button className={classes} onClick={this.props.runFn}>{runButtonText}</button>
        );
    }
}
