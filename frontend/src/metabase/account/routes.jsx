import React from "react";
import { t } from "ttag";
import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import AccountSettingsApp from "./settings/containers/AccountSettingsApp";
import UserProfileApp from "./profile/containers/UserProfileApp";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import NotificationSettingsApp from "./notifications/containers/NotificationSettingsApp";
import AdminHelpModal from "./notifications/containers/AdminHelpModal";
import UnsubscribeAlertModal from "./notifications/containers/UnsubscribeAlertModal";

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
      <Route path="notifications" component={NotificationSettingsApp}>
        <ModalRoute path="help" modal={AdminHelpModal} />
        <ModalRoute path="unsubscribe" modal={UnsubscribeAlertModal} />
      </Route>
    </Route>
  );
};

export default getRoutes;
