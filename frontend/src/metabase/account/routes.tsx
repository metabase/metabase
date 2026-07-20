import type { Store } from "@reduxjs/toolkit";

import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Route, type RouteComponent, redirect } from "metabase/router";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import { getNotificationRoutes } from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";

export const getAccountRoutes = (
  _store: Store<State>,
  IsAuthenticated: RouteComponent,
) => {
  return (
    <Route path="/account" element={<IsAuthenticated />}>
      <Route component={AccountApp}>
        <Route index component={redirect("profile")} />
        <Route path="profile" component={UserProfileApp} />
        <Route path="password" component={UserPasswordApp} />
        <Route
          path="security"
          component={PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel}
        />
        <Route path="login-history" component={LoginHistoryApp} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};
