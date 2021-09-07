import React from "react";
import { t } from "ttag";

import AuditContent from "../components/AuditContent";
import AuditAlertTable from "../containers/AuditAlertTable";
import AuditAlertDeleteModal from "../containers/AuditAlertDeleteModal";
import AuditSubscriptionTable from "../containers/AuditSubscriptionTable";
import AuditSubscriptionDeleteModal from "../containers/AuditSubscriptionDeleteModal";

const AuditSubscriptions = props => (
  <AuditContent {...props} tabs={AuditSubscriptions.tabs} />
);

AuditSubscriptions.tabs = [
  {
    path: "subscriptions",
    title: t`Subscriptions`,
    component: AuditSubscriptionTable,
    children: [
      {
        path: "delete",
        component: AuditSubscriptionDeleteModal,
      },
    ],
  },
  {
    path: "alerts",
    title: t`Alerts`,
    component: AuditAlertTable,
    children: [
      {
        path: "delete",
        component: AuditAlertDeleteModal,
      },
    ],
  },
];

export default AuditSubscriptions;
