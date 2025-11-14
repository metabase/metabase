import { Route } from "metabase/hoc/Title";

import { GlossaryPage } from "./pages/GlossaryPage";

export function getDataStudioGlossaryRoutes() {
  return <Route path="glossary" component={GlossaryPage} />;
}
