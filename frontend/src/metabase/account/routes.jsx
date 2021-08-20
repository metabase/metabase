import React from "react";
import { t } from "ttag";
import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import AccountSettingsApp from "./settings/containers/AccountSettingsApp";
import UserProfileApp from "./profile/containers/UserProfileApp";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";

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
    </Route>
  );
};

export default getRoutes;
