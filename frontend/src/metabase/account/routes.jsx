import React from "react";
import { t } from "ttag";
import { IndexRedirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import AccountProfileApp from "metabase/account/profile/containers/AccountProfileApp";
import AccountSettingsApp from "metabase/account/settings/containers/AccountSettingsApp";

const getRoutes = () => {
  return (
    <Route
      path="/account"
      title={t`Account settings`}
      component={AccountSettingsApp}
    >
      <IndexRedirect to="profile" />
      <Route path="profile" component={AccountProfileApp} />
    </Route>
  );
};

export default getRoutes;
