import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import QuestionPicker from "metabase/containers/QuestionPicker";

import MetabaseAnalytics from "metabase/lib/analytics";

export default class AddToDashSelectQuestionModal extends React.Component {
  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    addCardToDashboard: PropTypes.func.isRequired,
    onEditingChange: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };

  handleAdd = cardId => {
    this.props.addCardToDashboard({
      dashId: this.props.dashboard.id,
      cardId: cardId,
    });
    this.props.onEditingChange(this.props.dashboard);
    this.props.onClose();
    MetabaseAnalytics.trackEvent("Dashboard", "Add Card");
  };

  render() {
    return (
      <ModalContent
        title={t`Pick a question to add`}
        onClose={this.props.onClose}
      >
        <QuestionPicker onChange={this.handleAdd} />
      </ModalContent>
    );
  }
}
