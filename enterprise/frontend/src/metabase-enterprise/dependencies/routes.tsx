import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

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
    { path: "broken", element: <BrokenDependencyListPage /> },
    { path: "unreferenced", element: <UnreferencedDependencyListPage /> },
  ];
}
