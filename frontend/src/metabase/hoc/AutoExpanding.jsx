import React from "react";

import ExplicitSize from "metabase/components/ExplicitSize";

// If the composed element increases from it's original width, sets `expand` to true
//
// Used for components which we initially want to be small, but if they expand
// beyond their initial size we want to fix their size to be larger so it doesn't
// jump around, etc
export default ComposedComponent =>
  @ExplicitSize()
  class AutoExpanding extends React.Component {
    state = {
      expand: false,
    };
    componentWillReceiveProps(nextProps) {
      if (
        nextProps.width != null &&
        this.props.width != null &&
        nextProps.width > this.props.width
      ) {
        this.setState({ expand: true });
      }
    }
    render() {
      return <ComposedComponent {...this.props} {...this.state} />;
    }
  };
