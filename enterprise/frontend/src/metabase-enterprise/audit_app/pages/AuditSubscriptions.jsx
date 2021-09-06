import React from "react";
import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditAlertsTable from "../components/AuditAlertsTable";
import AuditSubscriptionsTable from "../components/AuditSubscriptionsTable";

const AuditSubscriptions = props => (
  <AuditContent {...props} tabs={AuditSubscriptions.tabs} />
);

AuditSubscriptions.tabs = [
  {
    path: "subscriptions",
    title: t`Subscriptions`,
    component: AuditSubscriptionsTable,
  },
  {
    path: "alerts",
    title: t`Alerts`,
    component: AuditAlertsTable,
  },
];

export default AuditSubscriptions;
