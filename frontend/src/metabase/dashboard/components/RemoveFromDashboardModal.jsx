import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import MetabaseAnalytics from "metabase/lib/analytics";
import ModalContent from "metabase/components/ModalContent.jsx";

export default class RemoveFromDashboardModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { deleteCard: false };
  }

  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    dashboard: PropTypes.object.isRequired,
    removeCardFromDashboard: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };

  onRemove() {
    this.props.removeCardFromDashboard({
      dashId: this.props.dashboard.id,
      dashcardId: this.props.dashcard.id,
    });
    if (this.state.deleteCard) {
      // this.props.dispatch(deleteCard(this.props.dashcard.card_id))
      // this.props.dispatch(markCardForDeletion(this.props.dashcard.card_id))
    }
    this.props.onClose();

    MetabaseAnalytics.trackEvent("Dashboard", "Remove Card");
  }

  render() {
    return (
      <ModalContent
        title={t`Remove this question?`}
        onClose={() => this.props.onClose()}
      >
        <div className="Form-actions flex-align-right">
          <button className="Button Button" onClick={this.props.onClose}>
            {t`Cancel`}
          </button>
          <button
            className="Button Button--danger ml2"
            onClick={() => this.onRemove()}
          >
            {t`Remove`}
          </button>
        </div>
      </ModalContent>
    );
  }
}
