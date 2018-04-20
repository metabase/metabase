import React, { Component } from "react";

import "./ThinProgressBar.css";

export default class ThinProgressBar extends Component {
  static defaultProps = {
    fill: "currentcolor",
    className: "loader",
  };

  render() {
    var { size, className } = this.props;
    return (
      <div className={className}>
      </div>
    );
  }
}
