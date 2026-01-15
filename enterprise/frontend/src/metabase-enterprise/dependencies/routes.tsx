import { IndexRedirect, IndexRoute, Route } from "react-router";

import { isCypressActive } from "metabase/env";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioTasksRoutes() {
  /* TODO (Alex P 01/15/2026): remove isCypressActive once we are ready to release this feature */
  if (!isCypressActive) {
    return null;
  }

  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyListPage} />
      <Route path="unreferenced" component={UnreferencedDependencyListPage} />
    </>
  );
}
