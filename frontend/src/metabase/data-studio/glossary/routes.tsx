import type { RouteObject } from "react-router-dom";

import { Route } from "metabase/routing/compat/react-router-v3";

import { GlossaryPage } from "./pages/GlossaryPage";

export function getDataStudioGlossaryRoutes() {
  return <Route path="glossary" component={GlossaryPage} />;
}

export function getDataStudioGlossaryRouteObjects(): RouteObject[] {
  return [{ path: "glossary", element: <GlossaryPage /> }];
}
