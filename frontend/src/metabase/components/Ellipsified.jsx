/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ResizeObserver from "resize-observer-polyfill";

import Tooltip from "metabase/components/Tooltip";

export default class Ellipsified extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      isTruncated: false,
    };
  }

  static propTypes = {};
  static defaultProps = {
    style: {},
    className: "",
    showTooltip: true,
  };

  componentDidMount() {
    // NOTE: Assumes _content won't change. Is this safe?
    this._ro = new ResizeObserver((entries, observer) => {
      this._updateTruncated();
    });
    this._ro.observe(this._content);
    this._updateTruncated();
  }

  componentWillUnmount() {
    this._ro.disconnect();
  }

  _updateTruncated() {
    const isTruncated = this._content.offsetWidth < this._content.scrollWidth;
    if (this.state.isTruncated !== isTruncated) {
      this.setState({ isTruncated });
    }
  }

  render() {
    const {
      showTooltip,
      children,
      style,
      className,
      tooltip,
      alwaysShowTooltip,
      tooltipMaxWidth,
    } = this.props;
    const { isTruncated } = this.state;
    return (
      <Tooltip
        tooltip={tooltip || children || " "}
        verticalAttachments={["top", "bottom"]}
        isEnabled={(showTooltip && (isTruncated || alwaysShowTooltip)) || false}
        maxWidth={tooltipMaxWidth}
      >
        <div
          ref={r => (this._content = r)}
          className={className}
          style={{
            ...style,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {children}
        </div>
      </Tooltip>
    );
  }
}
