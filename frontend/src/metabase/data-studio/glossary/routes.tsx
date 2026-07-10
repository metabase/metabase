import { Route } from "metabase/router";

import { GlossaryPage } from "./pages/GlossaryPage";

export function getDataStudioGlossaryRoutes() {
  return <Route path="glossary" component={GlossaryPage} />;
}
