import type { Store } from "@reduxjs/toolkit";

import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Route, type RouteComponent, redirect } from "metabase/router";

import { AccountApp } from "./app/containers/AccountApp";
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
      <Route element={<AccountApp />}>
        <Route index element={redirect("profile")} />
        <Route path="profile" element={<UserProfileApp />} />
        <Route path="password" element={<UserPasswordApp />} />
        <Route
          path="security"
          element={<PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel />}
        />
        <Route path="login-history" element={<LoginHistoryApp />} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};
