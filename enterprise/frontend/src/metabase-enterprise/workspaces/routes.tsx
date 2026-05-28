import type { Store } from "@reduxjs/toolkit";
import {
  IndexRoute,
  type RedirectFunction,
  Route,
  type RouteComponent,
} from "react-router";

import type { State } from "metabase/redux/store";
import * as Urls from "metabase/urls";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceInstancePage } from "./pages/WorkspaceInstancePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { getIsDevelopmentInstance } from "./selectors";

export function getDataStudioRoutes(store: Store<State>) {
  const handleManagerRouteEnter = (
    _nextState: unknown,
    replace: RedirectFunction,
  ) => {
    if (getIsDevelopmentInstance(store.getState())) {
      replace(Urls.workspaceInstance());
    }
  };

  const handleInstanceRouteEnter = (
    _nextState: unknown,
    replace: RedirectFunction,
  ) => {
    if (!getIsDevelopmentInstance(store.getState())) {
      replace(Urls.workspaces());
    }
  };

  return (
    <Route path="workspaces">
      <IndexRoute
        component={WorkspaceListPage}
        onEnter={handleManagerRouteEnter}
      />
      <Route
        path="instance"
        component={WorkspaceInstancePage}
        onEnter={handleInstanceRouteEnter}
      />
      <Route
        path=":workspaceId"
        component={WorkspacePage}
        onEnter={handleManagerRouteEnter}
      />
    </Route>
  );
}

export function getAdminConnectionInfoRoutes(IsAdmin: RouteComponent) {
  return (
    <Route component={IsAdmin}>
      <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />
    </Route>
  );
}
