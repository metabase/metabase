import React, { Component } from "react";

import Modal from "metabase/components/Modal";
import { t } from "ttag";

export default class SavedQuestionIntroModal extends Component {
  render() {
    return (
      <Modal isOpen={this.props.isShowingNewbModal}>
        <h2 className="pt4 pb2">{t`It's okay to play around with saved questions`}</h2>
        <div className="pb2 text-paragraph">{t`You won't make any permanent changes to a saved question unless you click Save and choose to replace the original question.`}</div>
        <div className="Form-actions flex justify-center py1">
          <button
            data-metabase-event={"QueryBuilder;IntroModal"}
            className="Button Button--primary"
            onClick={() => this.props.onClose()}
          >{t`Okay`}</button>
        </div>
      </Modal>
    );
  }
}
