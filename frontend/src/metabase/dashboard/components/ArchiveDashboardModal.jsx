import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ModalContent from "metabase/components/ModalContent.jsx";

export default class ArchiveDashboardModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      error: null,
    };
  }

  static propTypes = {
    dashboard: PropTypes.object.isRequired,

    onClose: PropTypes.func,
    onArchive: PropTypes.func,
  };

  async archiveDashboard() {
    try {
      this.props.onArchive(this.props.dashboard);
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    let formError;
    if (this.state.error) {
      let errorMessage = "Server error encountered";
      if (this.state.error.data && this.state.error.data.message) {
        errorMessage = this.state.error.data.message;
      } else {
        errorMessage = this.state.error.message;
      }

      // TODO: timeout display?
      formError = <span className="text-error px2">{errorMessage}</span>;
    }

    return (
      <ModalContent title={t`Archive Dashboard`} onClose={this.props.onClose}>
        <div className="Form-inputs mb4">
          <p>{t`Are you sure you want to do this?`}</p>
        </div>

        <div className="Form-actions">
          <button
            className="Button Button--danger"
            onClick={() => this.archiveDashboard()}
          >
            Yes
          </button>
          <button
            className="Button Button--primary ml1"
            onClick={this.props.onClose}
          >
            No
          </button>
          {formError}
        </div>
      </ModalContent>
    );
  }
}
