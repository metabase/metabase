/* @flow */
import React, { Component } from "react";
import cxs from "cxs";

import colors from "metabase/lib/colors";

type Props = {
  percentage: number,
  animated: boolean,
  color: string,
};

export default class ProgressBar extends Component {
  props: Props;

  static defaultProps = {
    animated: false,
    color: colors["brand"],
  };

  render() {
    const { percentage, animated, color } = this.props;

    const width = percentage * 100;

    const wrapperStyles = cxs({
      position: "relative",
      border: `1px solid ${color}`,
      height: 10,
      borderRadius: 99,
    });

    const progressStyles = cxs({
      overflow: "hidden",
      backgroundColor: color,
      position: "relative",
      height: "100%",
      top: 0,
      left: 0,
      borderRadius: "inherit",
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      width: `${width}%`,
      ":before": {
        display: animated ? "block" : "none",
        position: "absolute",
        content: '""', // need to wrap this in quotes so it actually outputs as valid CSS
        left: 0,
        width: `${width / 4}%`,
        height: "100%",
        backgroundColor: colors["bg-black"],
        animation: animated ? "progress-bar 1.5s linear infinite" : "none",
      },
    });

    return (
      <div className={wrapperStyles}>
        <div className={progressStyles} />
      </div>
    );
  }
}
