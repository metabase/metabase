import { IndexRedirect, IndexRoute, Route } from "react-router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./pages/DependencyListPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyListPage} />
      <Route path="unreferenced" component={UnreferencedDependencyListPage} />
    </>
  );
}
