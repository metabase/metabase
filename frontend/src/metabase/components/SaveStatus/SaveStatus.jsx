/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { addUndo, dismissUndo } from "metabase/redux/undo";

class SaveStatus extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = { showSavingingTimeout: null };

    _.bindAll(this, "setSaving", "setSaved", "setSaveError", "clear");
  }

  unnotify = () => {
    this.props.unnotify("save-status");
  };

  notify = undo => {
    clearTimeout(this.state.showSavingingTimeout);
    this.unnotify();
    this.props.notify({ id: "save-status", ...undo });
  };

  setSaving() {
    clearTimeout(this.state.showSavingingTimeout);
    // don't show saving status until after 1 second has elapsed
    // this avoids quick showing / hiding / then showing a toast again
    const timeout = setTimeout(() => {
      this.notify({ icon: "info", message: t`Saving...`, timeout: null });
    }, 1000);
    this.setState({ showSavingingTimeout: timeout });
  }

  setSaved(message = t`Changes saved`) {
    this.notify({ message });
  }

  setSaveError(error) {
    const message = t`Error:` + " " + String(error.message || error);
    this.notify({ icon: "warning", message, timeout: null });
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
