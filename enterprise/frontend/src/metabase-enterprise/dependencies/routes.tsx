import { IndexRedirect, IndexRoute, Route } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import { UnreferencedDependenciesPage } from "./pages/UnreferencedDependenciesPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="unreferenced" />
      <Route path="unreferenced" component={UnreferencedDependenciesPage} />
    </>
  );
}
