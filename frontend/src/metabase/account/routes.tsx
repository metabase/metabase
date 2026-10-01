import type { Store } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import { Route, type RouteComponent, redirect } from "metabase/router";

import { getNotificationRoutes } from "./notifications/routes";

/**
 * The account pages, in their own chunk. `IsAuthenticated` stays eager: it has
 * to decide before there is anything to show.
 */
const accountApp = () =>
  import(/* webpackChunkName: "account" */ "./app/containers/AccountApp").then(
    ({ AccountApp }) => ({
      Component: AccountApp,
    }),
  );

const userProfileApp = () =>
  import(
    /* webpackChunkName: "account" */ "./profile/containers/UserProfileApp"
  ).then((module) => ({
    Component: module.default,
  }));

const userPasswordApp = () =>
  import(
    /* webpackChunkName: "account" */ "./password/containers/UserPasswordApp"
  ).then((module) => ({
    Component: module.default,
  }));

const loginHistoryApp = () =>
  import(
    /* webpackChunkName: "account" */ "./login-history/containers/LoginHistoryApp"
  ).then((module) => ({
    Component: module.default,
  }));

export const getAccountRoutes = (
  _store: Store<State>,
  IsAuthenticated: RouteComponent,
) => {
  return (
    <Route path="/account" element={<IsAuthenticated />}>
      <Route lazy={accountApp}>
        <Route index element={redirect("profile")} />
        <Route path="profile" lazy={userProfileApp} />
        <Route path="authentication" lazy={userPasswordApp} />
        <Route path="login-history" lazy={loginHistoryApp} />
        {/* Legacy path redirects */}
        <Route path="security" element={redirect("/account/authentication")} />
        <Route path="password" element={redirect("/account/authentication")} />
        {getNotificationRoutes()}
      </Route>
    </Route>
  );
};
