import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { useCompatLocation } from "metabase/routing/compat";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages/DependencyDiagnosticsPage";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";

const BrokenDependencyListPageWithRouteProps = () => {
  const location = useCompatLocation();
  return <BrokenDependencyDiagnosticsPage location={location} />;
};

const UnreferencedDependencyListPageWithRouteProps = () => {
  const location = useCompatLocation();
  return <UnreferencedDependencyDiagnosticsPage location={location} />;
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
