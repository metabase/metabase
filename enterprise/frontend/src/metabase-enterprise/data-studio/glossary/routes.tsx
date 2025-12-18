import { Route } from "react-router";

import { GlossaryPage } from "./pages/GlossaryPage";

export function getDataStudioGlossaryRoutes() {
  return <Route path="glossary" component={GlossaryPage} />;
}
