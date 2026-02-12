import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRedirect, Route } from "react-router";

import type { State } from "metabase-types/store";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import { getNotificationRoutes } from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";

export const getAccountRoutes = (
  _store: Store<State>,
  IsAuthenticated: ComponentType,
) => {
  return (
    <Route path="/account" component={IsAuthenticated}>
      <Route component={AccountApp}>
        <IndexRedirect to="profile" />
        <Route path="profile" component={UserProfileApp} />
        <Route path="password" component={UserPasswordApp} />
        <Route path="login-history" component={LoginHistoryApp} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};
