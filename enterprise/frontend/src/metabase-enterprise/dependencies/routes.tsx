import { Route } from "metabase/router";

export const dependencyGraphPage = () =>
  import("./pages/DependencyGraphPage").then(({ DependencyGraphPage }) => ({
    Component: DependencyGraphPage,
  }));

export function getDataStudioDependencyRoutes() {
  return <Route index lazy={dependencyGraphPage} />;
}
