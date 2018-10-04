import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalContent from "metabase/components/ModalContent.jsx";
import { t } from "c-3po";

export default class QuestionSavedModal extends Component {
  static propTypes = {
    addToDashboardFn: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };

  render() {
    return (
      <ModalContent
        id="QuestionSavedModal"
        title={t`Saved! Add this to a dashboard?`}
        onClose={this.props.onClose}
        className="Modal-content Modal-content--small NewForm"
      >
        <div>
          <button
            className="Button Button--primary"
            onClick={this.props.addToDashboardFn}
          >{t`Yes please!`}</button>
          <button
            className="Button ml3"
            onClick={this.props.onClose}
          >{t`Not now`}</button>
        </div>
      </ModalContent>
    );
  }
}
