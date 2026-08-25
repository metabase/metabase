import { Route } from "metabase/router";

import { loadDependencyGraphPage } from "./lazy";

const dependencyGraphPage = () =>
  loadDependencyGraphPage().then(({ DependencyGraphPage }) => ({
    Component: DependencyGraphPage,
  }));

export function getDataStudioDependencyRoutes() {
  return <Route index lazy={dependencyGraphPage} />;
}
