import React, { Component } from "react";
import { t } from "c-3po";

import ModalContent from "metabase/components/ModalContent.jsx";
import QuestionPicker from "metabase/containers/QuestionPicker";

export default class AddToDashboard extends Component {
  render() {
    return (
      <ModalContent
        title={t`Pick a question to add`}
        onClose={this.props.onClose}
      >
        <QuestionPicker onChange={this.props.onAdd} />
      </ModalContent>
    );
  }
}
