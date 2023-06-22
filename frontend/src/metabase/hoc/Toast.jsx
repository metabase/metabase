/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { addUndo } from "metabase/redux/undo";

const mapDispatchToProps = {
  addUndo,
};

/**
 * @deprecated HOCs are deprecated
 */
const withToaster = ComposedComponent => {
  class ToastedComponent extends Component {
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
  return connect(null, mapDispatchToProps)(ToastedComponent);
};

export default withToaster;
