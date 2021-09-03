import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { push } from "react-router-redux";

import AuditTableWithSearch from "../containers/AuditTableWithSearch";

import * as SubscriptionAlertsCards from "../lib/cards/subscriptions_alerts";

const propTypes = {
  onRemove: PropTypes.func.isRequired,
};

const AuditSubscriptionsTab = ({ onRemove }) => {
  return (
    <AuditTableWithSearch
      placeholder={t`Filter by dashboard name`}
      table={SubscriptionAlertsCards.subscriptions()}
      onRemoveRow={onRemove}
    />
  );
};

AuditSubscriptionsTab.propTypes = propTypes;

export default connect(
  null,
  {
    onRemove: row => push(`/audit/subscriptions/${row.subscription_id}/remove`),
  },
)(AuditSubscriptionsTab);
