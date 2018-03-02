import React, { Component } from "react";

import Tooltip from "metabase/components/Tooltip";

const Tooltipify = ComposedComponent =>
  class extends Component {
    static displayName = "Tooltipify[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";
    render() {
      const { tooltip, ...props } = this.props;
      if (tooltip) {
        return (
          <Tooltip tooltip={tooltip}>
            <ComposedComponent {...props} />
          </Tooltip>
        );
      } else {
        return <ComposedComponent {...props} />;
      }
    }
  };

export default Tooltipify;
