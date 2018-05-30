import React from "react";
import { connect } from "react-redux";

import { createUndo, addUndo } from "metabase/redux/undo";

const mapDispatchToProps = {
  createUndo,
  addUndo,
};

const withToast = ComposedComponent => {
  @connect(null, mapDispatchToProps)
  class ToastedComponent extends React.Component {
    _triggerToast(toastContent) {
      const { addUndo, createUndo } = this.props;

      addUndo(
        createUndo({
          type: "toast",
          message: toastContent,
        }),
      );
    }
    render() {
      return (
        <ComposedComponent
          triggerToast={this._triggerToast.bind(this)}
          // TODO - omit createUndo, addUndo
          {...this.props}
        />
      );
    }
  }
  return ToastedComponent;
};

export default withToast;
