import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import MetabaseAnalytics from "metabase/lib/analytics";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

export default class RemoveFromDashboardModal extends Component {
  state = { deleteCard: false };

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
    const { onClose } = this.props;
    return (
      <ModalContent title={t`Remove this question?`} onClose={() => onClose()}>
        <div className="flex-align-right">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button danger ml={2} onClick={() => this.onRemove()}>
            {t`Remove`}
          </Button>
        </div>
      </ModalContent>
    );
  }
}
