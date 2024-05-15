/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import CS from "metabase/css/core/index.css";

export default class AdminHeader extends Component {
  render() {
    return (
      <div
        className={cx(
          "MetadataEditor-header",
          CS.clearfix,
          CS.relative,
          CS.flexNoShrink,
        )}
      >
        <div
          className={cx(
            "MetadataEditor-headerSection",
            CS.floatLeft,
            CS.h2,
            CS.textMedium,
          )}
        >
          {this.props.title}
        </div>
      </div>
    );
  }
}
