import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router-dom";

import type { State } from "metabase-types/store";

import AccountApp from "./app/containers/AccountApp";
import LoginHistoryApp from "./login-history/containers/LoginHistoryApp";
import { getNotificationRouteObjects } from "./notifications/routes";
import UserPasswordApp from "./password/containers/UserPasswordApp";
import UserProfileApp from "./profile/containers/UserProfileApp";

const AccountAppWithOutlet = () => (
  <AccountApp>
    <Outlet />
  </AccountApp>
);

export const getAccountRoutes = (
  _store: Store<State>,
  _IsAuthenticated: ComponentType,
) => {
  return null;
};

export function getAccountRouteObjects(): RouteObject[] {
  return [
    {
      path: "/account",
      element: <AccountAppWithOutlet />,
      children: [
        { index: true, element: <Navigate to="profile" replace /> },
        { path: "profile", element: <UserProfileApp /> },
        { path: "password", element: <UserPasswordApp /> },
        { path: "login-history", element: <LoginHistoryApp /> },
        ...getNotificationRouteObjects(),
      ],
    },
  ];
}
