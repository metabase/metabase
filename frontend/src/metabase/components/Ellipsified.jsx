import React, { Component } from "react";
import ReactDOM from "react-dom";

import Tooltip from "metabase/components/Tooltip.jsx";

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

  componentDidUpdate() {
    // Only show tooltip if title is hidden or ellipsified
    const element = ReactDOM.findDOMNode(this.refs.content);
    const isTruncated = element && element.offsetWidth < element.scrollWidth;
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
          ref="content"
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
