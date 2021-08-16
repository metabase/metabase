import React from "react";
import { t } from "ttag";
import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import UserProfileApp from "./profile/containers/UserProfileApp";
import AccountSettingsApp from "./settings/containers/AccountSettingsApp";

const getRoutes = () => {
  return (
    <Route
      path="/account"
      title={t`Account settings`}
      component={AccountSettingsApp}
    >
      <IndexRedirect to="profile" />
      <Route path="profile" component={UserProfileApp} />
    </Route>
  );
};

export default getRoutes;
