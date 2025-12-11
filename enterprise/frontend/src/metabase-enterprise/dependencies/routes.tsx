import { IndexRedirect, IndexRoute, Route } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import { DependencyListLayout } from "./pages/DependencyListLayout";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioTasksRoutes() {
  return (
    <Route component={DependencyListLayout}>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyListPage} />
      <Route path="unreferenced" component={UnreferencedDependencyListPage} />
    </Route>
  );
}
