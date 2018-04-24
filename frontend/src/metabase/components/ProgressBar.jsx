/* @flow */
import React, { Component } from "react";
import cxs from "cxs";

type Props = {
  percentage: Number,
  animated: Boolean,
};

export default class ProgressBar extends Component {
  props: Props;

  static defaultProps = {
    animated: false,
  };

  render() {
    const { percentage, animated } = this.props;

    const wrapperStyles = cxs({
      position: "relative",
      border: "1px solid #6f7a8b",
      height: 10,
      borderRadius: 99,
    });

    const progressStyles = cxs({
      overflow: "hidden",
      backgroundColor: "#6f7a8b",
      position: "relative",
      height: "100%",
      top: 0,
      left: 0,
      borderRadius: "inherit",
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      width: `${percentage * 100}%`,
      ":before": {
        display: "block",
        position: "absolute",
        content: '""', // need to wrap this in quotes so it actually outputs as valid CSS
        left: 0,
        width: 50,
        height: "100",
        backgroundColor: "red",
        animation: animated ? "move-ltr 1.5s linear infinite" : "none",
      },
    });

    return (
      <div className={wrapperStyles}>
        <div className={progressStyles} />
      </div>
    );
  }
}
