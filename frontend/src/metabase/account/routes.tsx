import type { Store } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import { IndexRedirect, Route, type RouteComponent } from "metabase/router";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import { getNotificationRoutes } from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";
import { SecurityApp } from "./security/SecurityApp";

export const getAccountRoutes = (
  _store: Store<State>,
  IsAuthenticated: RouteComponent,
) => {
  return (
    <Route path="/account" component={IsAuthenticated}>
      <Route component={AccountApp}>
        <IndexRedirect to="profile" />
        <Route path="profile" component={UserProfileApp} />
        <Route path="password" component={UserPasswordApp} />
        <Route path="security" component={SecurityApp} />
        <Route path="login-history" component={LoginHistoryApp} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};
