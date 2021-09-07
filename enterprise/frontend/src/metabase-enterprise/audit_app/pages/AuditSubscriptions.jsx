import React from "react";
import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditAlertTable from "../containers/AuditAlertTable";
import AuditSubscriptionTable from "../containers/AuditSubscriptionTable";

const AuditSubscriptions = props => (
  <AuditContent {...props} tabs={AuditSubscriptions.tabs} />
);

AuditSubscriptions.tabs = [
  {
    path: "subscriptions",
    title: t`Subscriptions`,
    component: AuditSubscriptionTable,
  },
  {
    path: "alerts",
    title: t`Alerts`,
    component: AuditAlertTable,
  },
];

export default AuditSubscriptions;
