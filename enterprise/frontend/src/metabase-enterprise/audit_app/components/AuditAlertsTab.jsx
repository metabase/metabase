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

const AuditAlertsTab = ({ onRemove }) => {
  return (
    <AuditTableWithSearch
      placeholder={t`Filter by question name`}
      table={SubscriptionAlertsCards.alerts()}
      onRemoveRow={onRemove}
    />
  );
};

AuditAlertsTab.propTypes = propTypes;

export default connect(
  null,
  {
    onRemove: ({ id }) => push(`/audit/alerts/${id}/remove`),
  },
);
