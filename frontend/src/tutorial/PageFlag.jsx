import React, { Component, PropTypes } from "react";

import TimeoutTransitionGroup from "react-components/timeout-transition-group";

import BodyComponent from "metabase/components/BodyComponent.jsx";

import cx from "classnames";

@BodyComponent
export default class PageFlag extends Component {
    renderPageFlag() {
        let position = this.props.target.getBoundingClientRect();
        let isLarge = !!this.props.text;
        let style = {
            position: "absolute",
            left: position.left + position.width,
            top: position.top + position.height / 2 - (isLarge ? 21 : 12)
        };
        return (
            <div key="flag" className={cx("PageFlag", { "PageFlag--large": isLarge, "bounce-left": this.props.bounce })} style={style}>{this.props.text}</div>
        );
    }

    render() {
        return (
            <TimeoutTransitionGroup transitionName="PageFlag" enterTimeout={250} leaveTimeout={250}>
                { this.props.target ? [this.renderPageFlag()] : [] }
            </TimeoutTransitionGroup>
        );
    }
}
