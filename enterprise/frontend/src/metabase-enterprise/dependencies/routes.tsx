import type { RouteObject } from "react-router-dom";
import { Navigate, useLocation } from "react-router-dom";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages/DependencyDiagnosticsPage";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";

const BrokenDependencyListPageWithRouteProps = () => {
  const location = useLocation();
  return <BrokenDependencyDiagnosticsPage location={location} />;
};

const UnreferencedDependencyListPageWithRouteProps = () => {
  const location = useLocation();
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
