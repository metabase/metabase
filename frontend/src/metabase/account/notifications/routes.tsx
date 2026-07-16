import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";

import { HelpModal } from "./components/HelpModal";
import { DeleteAlertModal } from "./containers/ArchiveAlertModal";
import { ArchivePulseModal } from "./containers/ArchivePulseModal";
import { NotificationsApp } from "./containers/NotificationsApp";
import { UnsubscribeAlertModal } from "./containers/UnsubscribeAlertModal";
import { UnsubscribePulseModal } from "./containers/UnsubscribePulseModal";

export function getNotificationRoutes() {
  return (
    <Route path="notifications" component={NotificationsApp}>
      {modalRoute("help", HelpModal)}
      {modalRoute("alert/:alertId/archive", DeleteAlertModal, { noWrap: true })}
      {modalRoute("pulse/:pulseId/archive", ArchivePulseModal)}
      {modalRoute("alert/:alertId/unsubscribe", UnsubscribeAlertModal, {
        noWrap: true,
      })}
      {modalRoute("pulse/:pulseId/unsubscribe", UnsubscribePulseModal)}
    </Route>
  );
}
