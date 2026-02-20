import type { RouteObject } from "react-router-dom";

import { GlossaryPage } from "./pages/GlossaryPage";

export function getDataStudioGlossaryRoutes() {
  return null;
}

export function getDataStudioGlossaryRouteObjects(): RouteObject[] {
  return [{ path: "glossary", element: <GlossaryPage /> }];
}
