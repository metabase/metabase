import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { useCompatLocation } from "metabase/routing/compat";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

const BrokenDependencyListPageWithRouteProps = () => {
  const location = useCompatLocation();
  return <BrokenDependencyListPage location={location} />;
};

const UnreferencedDependencyListPageWithRouteProps = () => {
  const location = useCompatLocation();
  return <UnreferencedDependencyListPage location={location} />;
};

export function getDataStudioDependencyRoutes() {
  return null;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return null;
}

export function getDataStudioDependencyRouteObjects(): RouteObject[] {
  return [{ index: true, element: <DependencyGraphPage /> }];
}

export function getDataStudioDependencyDiagnosticsRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <Navigate to="broken" replace /> },
    { path: "broken", element: <BrokenDependencyListPageWithRouteProps /> },
    {
      path: "unreferenced",
      element: <UnreferencedDependencyListPageWithRouteProps />,
    },
  ];
}
