import { IndexRedirect, IndexRoute, Route } from "react-router";

import { BrokenDependencyListPage } from "./pages/BrokenDependencyListPage";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import { UnreferencedDependencyListPage } from "./pages/UnreferencedDependencyListPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioTasksRoutes() {
  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyListPage} />
      <Route path="unreferenced" component={UnreferencedDependencyListPage} />
    </>
  );
}
