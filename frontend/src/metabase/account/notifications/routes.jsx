import React from "react";
import { Route } from "metabase/hoc/Title";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import NotificationsApp from "./containers/NotificationsApp";
import HelpModal from "./containers/HelpModal";
import DeleteAlertModal from "./containers/DeleteAlertModal";
import DeletePulseModal from "./containers/DeletePulseModal";
import UnsubscribeAlertModal from "./containers/UnsubscribeAlertModal";
import UnsubscribePulseModal from "./containers/UnsubscribePulseModal";

const getRoutes = () => (
  <Route path="notifications" component={NotificationsApp}>
    <ModalRoute path="help" modal={HelpModal} />
    <ModalRoute path="alert/:alertId/delete" modal={DeleteAlertModal} />
    <ModalRoute path="pulse/:pulseId/delete" modal={DeletePulseModal} />
    <ModalRoute
      path="alert/:alertId/unsubscribe"
      modal={UnsubscribeAlertModal}
    />
    <ModalRoute
      path="pulse/:pulseId/unsubscribe"
      modal={UnsubscribePulseModal}
    />
  </Route>
);

export default getRoutes;
