import React from "react";
import { t } from "ttag";
import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import AccountSettingsApp from "./settings/containers/AccountSettingsApp";
import UserProfileApp from "./profile/containers/UserProfileApp";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import NotificationsApp from "./notifications/containers/NotificationsApp";
import HelpModal from "./notifications/containers/HelpModal";
import DeleteAlertModal from "./notifications/containers/DeleteAlertModal";
import DeletePulseModal from "./notifications/containers/DeletePulseModal";
import UnsubscribeAlertModal from "./notifications/containers/UnsubscribeAlertModal";
import UnsubscribePulseModal from "./notifications/containers/UnsubscribePulseModal";

const getRoutes = () => {
  return (
    <Route
      path="/account"
      title={t`Account settings`}
      component={AccountSettingsApp}
    >
      <IndexRedirect to="profile" />
      <Route path="profile" component={UserProfileApp} />
      <Route path="password" component={UserPasswordApp} />
      <Route path="login-history" component={LoginHistoryApp} />
      <Route path="notifications" component={NotificationsApp}>
        <ModalRoute path="help" modal={HelpModal} />
        <Route path="alerts/:alertId">
          <ModalRoute path="unsubscribe" modal={UnsubscribeAlertModal} />
          <ModalRoute path="delete" modal={DeleteAlertModal} />
        </Route>
        <Route path="pulses/:pulseId">
          <ModalRoute path="unsubscribe" modal={UnsubscribePulseModal} />
          <ModalRoute path="delete" modal={DeletePulseModal} />
        </Route>
      </Route>
    </Route>
  );
};

export default getRoutes;
