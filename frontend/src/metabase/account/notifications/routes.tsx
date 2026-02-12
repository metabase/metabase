import { Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";

import { HelpModal } from "./components/HelpModal";
import { DeleteAlertModal } from "./containers/ArchiveAlertModal";
import { ArchivePulseModal } from "./containers/ArchivePulseModal";
import { NotificationsApp } from "./containers/NotificationsApp";
import { UnsubscribeAlertModal } from "./containers/UnsubscribeAlertModal";
import { UnsubscribePulseModal } from "./containers/UnsubscribePulseModal";

export function getNotificationRoutes() {
  return (
    <Route path="notifications" component={NotificationsApp}>
      <ModalRoute path="help" modal={HelpModal} />
      <ModalRoute
        path="alert/:alertId/archive"
        modal={DeleteAlertModal}
        noWrap
      />
      <ModalRoute path="pulse/:pulseId/archive" modal={ArchivePulseModal} />
      <ModalRoute
        path="alert/:alertId/unsubscribe"
        modal={UnsubscribeAlertModal}
        noWrap
      />
      <ModalRoute
        path="pulse/:pulseId/unsubscribe"
        modal={UnsubscribePulseModal}
      />
    </Route>
  );
}
