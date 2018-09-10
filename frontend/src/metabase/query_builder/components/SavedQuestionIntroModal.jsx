import React, { Component } from "react";

import Modal from "metabase/components/Modal.jsx";
import { t } from "c-3po";

export default class SavedQuestionIntroModal extends Component {
  render() {
    return (
      <Modal small isOpen={this.props.isShowingNewbModal}>
        <div className="Modal-content Modal-content--small NewForm">
          <div className="Modal-header Form-header">
            <h2 className="pb2 text-dark">{t`It's okay to play around with saved questions`}</h2>

            <div className="pb1 text-medium">{t`You won't make any permanent changes to a saved question unless you click the edit icon in the top-right.`}</div>
          </div>

          <div className="Form-actions flex justify-center py1">
            <button
              data-metabase-event={"QueryBuilder;IntroModal"}
              className="Button Button--primary"
              onClick={() => this.props.onClose()}
            >{t`Okay`}</button>
          </div>
        </div>
      </Modal>
    );
  }
}
