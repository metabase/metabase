import React from "react";
import { connect } from "react-redux";

import { addUndo } from "metabase/redux/undo";

const mapDispatchToProps = {
  addUndo,
};

const withToaster = ComposedComponent => {
  @connect(
    null,
    mapDispatchToProps,
  )
  class ToastedComponent extends React.Component {
    _triggerToast = (message, options = {}) => {
      const { addUndo } = this.props;
      addUndo({ message, ...options });
    };
    render() {
      return (
        <ComposedComponent
          triggerToast={this._triggerToast}
          // TODO - omit addUndo
          {...this.props}
        />
      );
    }
  }
  return ToastedComponent;
};

export default withToaster;
