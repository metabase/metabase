import React, { Component } from "react";

import "./PageFlag.css";

import { CSSTransitionGroup } from "react-transition-group";

import BodyComponent from "metabase/components/BodyComponent";

import cx from "classnames";

@BodyComponent
export default class PageFlag extends Component {
  componentWillMount() {
    // sometimes the position of target changes, track it here
    this._timer = setInterval(() => {
      if (this.props.target) {
        const p1 = this._position;
        const p2 = this.props.target.getBoundingClientRect();
        if (
          !p1 ||
          p1.left !== p2.left ||
          p1.top !== p2.top ||
          p1.width !== p2.width ||
          p1.height !== p2.height
        ) {
          this.forceUpdate();
        }
      }
    }, 100);
  }

  componentWillUnmount() {
    clearInterval(this._timer);
  }

  renderPageFlag() {
    let position = (this._position = this.props.target.getBoundingClientRect());
    let isLarge = !!this.props.text;
    let style = {
      position: "absolute",
      left: position.left + position.width,
      top: position.top + position.height / 2 - (isLarge ? 21 : 12),
    };
    return (
      <div
        key="flag"
        className={cx("PageFlag", {
          "PageFlag--large": isLarge,
          "bounce-left": this.props.bounce,
        })}
        style={style}
      >
        {this.props.text}
      </div>
    );
  }

  render() {
    return (
      <CSSTransitionGroup
        transitionName="PageFlag"
        transitionEnterTimeout={250}
        transitionLeaveTimeout={250}
      >
        {this.props.target ? [this.renderPageFlag()] : []}
      </CSSTransitionGroup>
    );
  }
}
