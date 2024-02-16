/* eslint-disable react/prop-types */
import { Component } from "react";

import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { addUndo, dismissUndo } from "metabase/redux/undo";

class SaveStatus extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      currentUndoId: null,
    };

    _.bindAll(this, "setSaving", "setSaved", "setSaveError", "clear");
  }

  unnotify = () => {
    if (this.state.currentUndoId) {
      this.props.unnotify(this.state.currentUndoId);
    }
  };

  notify = undo => {
    this.unnotify();
    this.props.notify(undo);
    this.setState({ currentUndoId: undo.id });
  };

  setSaving() {
    this.notify({ id: "save-status", icon: "info", message: t`Saving...` });
  }

  setSaved() {
    this.notify({ id: "save-status", message: t`Saved` });
  }

  setSaveError(error) {
    const message =
      t`Error:` + String(this.state.error.message || this.state.error);
    this.props.notify({ id: "save-status-error", icon: "error", message });
  }

  clear() {
    this.unnotify();
  }

  render() {
    return null;
  }
}

const mapDispatchToProps = dispatch => ({
  notify: undo => dispatch(addUndo(undo)),
  unnotify: undoId => dispatch(dismissUndo(undoId)),
});

export default _.compose(
  connect(null, mapDispatchToProps, null, { forwardRef: true }),
)(SaveStatus);
