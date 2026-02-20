import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import {
  IndexRedirect,
  IndexRoute,
  Route,
} from "metabase/routing/compat/react-router-v3";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyListPage} />
      <Route path="unreferenced" component={UnreferencedDependencyListPage} />
    </>
  );
}

export function getDataStudioDependencyRouteObjects(): RouteObject[] {
  return [{ index: true, element: <DependencyGraphPage /> }];
}

export function getDataStudioDependencyDiagnosticsRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <Navigate to="broken" replace /> },
    { path: "broken", element: <BrokenDependencyListPage /> },
    { path: "unreferenced", element: <UnreferencedDependencyListPage /> },
  ];
}
