/* eslint-disable react/prop-types */
import React, { Component } from "react";

import Tooltip from "metabase/components/Tooltip";

const Tooltipify = ComposedComponent =>
  class extends Component {
    static displayName =
      "Tooltipify[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";
    render() {
      const { tooltip, targetOffsetX, ...props } = this.props;
      if (tooltip) {
        return (
          <Tooltip tooltip={tooltip} targetOffsetX={targetOffsetX}>
            <ComposedComponent {...props} />
          </Tooltip>
        );
      } else {
        return <ComposedComponent {...props} />;
      }
    }
  };

export default Tooltipify;
