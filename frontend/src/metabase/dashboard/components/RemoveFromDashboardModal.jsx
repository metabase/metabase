import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";

export default class RemoveFromDashboardModal extends Component {
  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    dashboard: PropTypes.object.isRequired,
    removeCardFromDashboard: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };

  onRemove() {
    const { dashboard, dashcard, removeCardFromDashboard, onClose } =
      this.props;

    removeCardFromDashboard({
      dashId: dashboard.id,
      dashcardId: dashcard.id,
    });
    onClose();

    MetabaseAnalytics.trackStructEvent(
      dashboard.is_app_page ? "Data App Page" : "Dashboard",
      "Remove Card",
    );
  }

  render() {
    const { onClose } = this.props;
    return (
      <ModalContent title={t`Remove this card?`} onClose={onClose}>
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
