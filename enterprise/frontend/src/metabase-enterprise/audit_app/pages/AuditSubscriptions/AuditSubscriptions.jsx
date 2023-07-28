import { t } from "ttag";

import AuditContent from "../../components/AuditContent";
import AuditAlertTable from "../../containers/AuditAlertTable";
import AuditSubscriptionTable from "../../containers/AuditSubscriptionTable";
import AuditAlertEditModal from "../../containers/AuditAlertEditModal";
import AuditAlertDeleteModal from "../../containers/AuditAlertDeleteModal";
import AuditSubscriptionEditModal from "../../containers/AuditSubscriptionEditModal";
import AuditSubscriptionDeleteModal from "../../containers/AuditSubscriptionDeleteModal";

const AuditSubscriptions = props => (
  <AuditContent {...props} tabs={AuditSubscriptions.tabs} />
);

AuditSubscriptions.tabs = [
  {
    path: "subscriptions",
    title: t`Subscriptions`,
    component: AuditSubscriptionTable,
    modals: [
      {
        path: ":pulseId/edit",
        modal: AuditSubscriptionEditModal,
      },
      {
        path: ":pulseId/delete",
        modal: AuditSubscriptionDeleteModal,
      },
    ],
  },
  {
    path: "alerts",
    title: t`Alerts`,
    component: AuditAlertTable,
    modals: [
      {
        path: ":alertId/edit",
        modal: AuditAlertEditModal,
      },
      {
        path: ":alertId/delete",
        modal: AuditAlertDeleteModal,
      },
    ],
  },
];

export default AuditSubscriptions;
