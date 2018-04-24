import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

export default class ProgressBar extends Component {
  static propTypes = {
    percentage: PropTypes.number.isRequired,
    isAnimated: PropTypes.bool,
  };

  static defaultProps = {
    className: "ProgressBar",
    isAnimated: false,
  };

  render() {
    return (
      <div className={"overflow-hidden" + this.props.className}>
        <div
          className={cx("ProgressBar-progress", {"animation-loading-bar" : this.props.isAnimated})}
          style={{
            width: this.props.percentage * 100 + "%",
          }}
        />
      </div>
    );
  }
}
